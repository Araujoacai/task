import { db, auth } from './firebase-config.js';
import {
    collection, addDoc, onSnapshot, query, where,
    orderBy, deleteDoc, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { parseTaskFromText } from './ai-parser.js';

// ===================== ELEMENTOS DA UI =====================
const loginOverlay = document.getElementById('login-overlay');
const appWrapper = document.getElementById('app-wrapper');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnLoginText = document.getElementById('btn-login-text');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');
const authSubtitle = document.getElementById('auth-subtitle');
const authError = document.getElementById('auth-error');
const btnTogglePass = document.getElementById('btn-toggle-pass');
const passEyeIcon = document.getElementById('pass-eye-icon');
const userDisplayName = document.getElementById('user-display-name');
const userAvatar = document.getElementById('user-avatar');
const btnLogout = document.getElementById('btn-logout');
const btnPermNotif = document.getElementById('btn-perm-notif');
const notifIcon = document.getElementById('notif-icon');
const btnNewTask = document.getElementById('btn-new-task');

// Kanban
const listPending = document.getElementById('list-pending');
const listDoing = document.getElementById('list-doing');
const listDone = document.getElementById('list-done');
const countPending = document.getElementById('count-pending');
const countDoing = document.getElementById('count-doing');
const countDone = document.getElementById('count-done');

// Views
const viewKanban = document.getElementById('view-kanban');
const viewAgenda = document.getElementById('view-agenda');
const viewReports = document.getElementById('view-reports');
const viewTitle = document.getElementById('view-title');
const filterBar = document.getElementById('filter-bar');

// Agenda
const agendaContainer = document.getElementById('agenda-container');
const agendaRangeLabel = document.getElementById('agenda-range-label');
const agendaPrev = document.getElementById('agenda-prev');
const agendaNext = document.getElementById('agenda-next');
const agendaToday = document.getElementById('agenda-today');

// Filtros
const filterPriority = document.getElementById('filter-priority');
const filterCategory = document.getElementById('filter-category');
const btnClearFilters = document.getElementById('btn-clear-filters');

// Modal
const taskModal = document.getElementById('task-modal');
const modalForm = document.getElementById('modal-form');
const modalTitleEl = document.getElementById('modal-title');
const modalTaskId = document.getElementById('modal-task-id');
const modalTaskTitle = document.getElementById('modal-task-title');
const modalTaskDesc = document.getElementById('modal-task-desc');
const modalTaskDate = document.getElementById('modal-task-date');
const modalTaskTime = document.getElementById('modal-task-time');
const modalTaskPriority = document.getElementById('modal-task-priority');
const modalTaskStatus = document.getElementById('modal-task-status');
const modalTaskRecurrence = document.getElementById('modal-task-recurrence');
const recurrenceHint = document.getElementById('recurrence-hint');
const btnModalClose = document.getElementById('btn-modal-close');
const btnModalCancel = document.getElementById('btn-modal-cancel');

// Toast
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');

// Estado
let currentUser = null;
let isLoginMode = true;
let unsubscribeSnapshot = null;
let tasksCache = [];
let currentView = 'kanban';
let agendaWeekOffset = 0;
let notifInterval = null;
const notifiedTasks = new Set();
let activeFilters = { priority: '', category: '' };

// ===================== AUTENTICAÇÃO =====================

btnTogglePass.addEventListener('click', () => {
    const isPass = authPassword.type === 'password';
    authPassword.type = isPass ? 'text' : 'password';
    passEyeIcon.className = isPass ? 'ph ph-eye-slash' : 'ph ph-eye';
});

authToggleBtn.addEventListener('click', toggleAuthMode);

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        btnLoginText.textContent = 'Entrar';
        authToggleText.textContent = 'Não tem uma conta?';
        authToggleBtn.textContent = 'Cadastre-se';
        authSubtitle.textContent = 'Entre para gerenciar suas tarefas';
    } else {
        btnLoginText.textContent = 'Criar Conta';
        authToggleText.textContent = 'Já tem uma conta?';
        authToggleBtn.textContent = 'Fazer Login';
        authSubtitle.textContent = 'Crie sua conta gratuita agora';
    }
    authError.classList.add('hidden');
    authEmail.value = '';
    authPassword.value = '';
}

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    btnLogin.disabled = true;
    btnLoginText.innerHTML = '<i class="ph ph-spinner-gap spin"></i> Aguarde...';

    try {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        const codes = {
            'auth/invalid-credential': 'E-mail ou senha incorretos.',
            'auth/user-not-found': 'E-mail não cadastrado.',
            'auth/wrong-password': 'Senha incorreta.',
            'auth/email-already-in-use': 'E-mail já cadastrado.',
            'auth/weak-password': 'Senha deve ter ao menos 6 caracteres.',
            'auth/invalid-email': 'E-mail inválido.',
            'auth/too-many-requests': 'Muitas tentativas. Aguarde um momento.',
        };
        authError.textContent = codes[error.code] || `Erro: ${error.message}`;
        authError.classList.remove('hidden');
    }

    btnLogin.disabled = false;
    btnLoginText.textContent = isLoginMode ? 'Entrar' : 'Criar Conta';
});

btnLogout.addEventListener('click', () => { signOut(auth); });

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const name = user.displayName || user.email.split('@')[0];
        userDisplayName.textContent = `Olá, ${name}`;
        if (userAvatar) userAvatar.textContent = name.charAt(0).toUpperCase();

        loginOverlay.classList.remove('active');
        appWrapper.classList.remove('hidden');
        loadTasks();

        if ('Notification' in window && Notification.permission === 'granted') {
            setNotifActive(true);
            startNotificationLoop();
        }
    } else {
        currentUser = null;
        if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
        loginOverlay.classList.add('active');
        appWrapper.classList.add('hidden');
        clearLists();
    }
});

function clearLists() {
    listPending.innerHTML = '';
    listDoing.innerHTML = '';
    listDone.innerHTML = '';
}

// ===================== RECORRÊNCIA =====================

/**
 * Verifica se uma tarefa recorrente está ativa em uma data específica (YYYY-MM-DD).
 * - daily:   toda data a partir de task.date
 * - weekly:  mesmo dia da semana, a partir de task.date
 * - monthly: mesmo dia do mês, a partir de task.date
 */
function isRecurringActiveOnDate(task, dateStr) {
    if (!task.recurrence || task.recurrence === 'none') return false;

    const start = new Date(task.date + 'T00:00');
    const target = new Date(dateStr + 'T00:00');
    if (target < start) return false;   // antes do início

    if (task.recurrence === 'daily') return true;
    if (task.recurrence === 'weekly') return start.getDay() === target.getDay();
    if (task.recurrence === 'monthly') return start.getDate() === target.getDate();
    return false;
}

/**
 * Para o Kanban, retorna o status "efetivo" de uma tarefa recorrente no dia de hoje.
 * Se foi concluída HOJE → 'done_today' (aparece no Done mas volta amanhã).
 * Caso contrário → fica no status armazenado (pending / doing).
 */
function effectiveStatus(task) {
    if (!task.recurrence || task.recurrence === 'none') return task.status;
    const today = toDateValue(new Date());
    if (task.lastCompletedDate === today) return 'done_today';
    // Se estava como 'done' mas é recorrente e não foi concluída hoje, volta a pending
    if (task.status === 'done') return 'pending';
    return task.status;
}

// ===================== NAVEGAÇÃO DE VIEWS =====================

document.querySelectorAll('.nav-item[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(link.dataset.view);
        document.querySelectorAll('.nav-item[data-view]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});

document.querySelectorAll('.nav-filter').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('kanban');
        document.querySelectorAll('.nav-item[data-view]').forEach(l => l.classList.remove('active'));
        document.querySelector('[data-view="kanban"]').classList.add('active');
        filterCategory.value = link.dataset.category;
        activeFilters.category = link.dataset.category;
        renderFilteredBoard();
    });
});

function switchView(view) {
    currentView = view;
    viewKanban.classList.add('hidden');
    viewAgenda.classList.add('hidden');
    viewReports.classList.add('hidden');
    filterBar.classList.add('hidden');

    if (view === 'kanban') {
        viewKanban.classList.remove('hidden');
        filterBar.classList.remove('hidden');
        viewTitle.textContent = 'Minhas Tarefas';
        renderFilteredBoard();
    } else if (view === 'agenda') {
        viewAgenda.classList.remove('hidden');
        viewTitle.textContent = 'Agenda';
        renderAgenda();
    } else if (view === 'reports') {
        viewReports.classList.remove('hidden');
        viewTitle.textContent = 'Relatórios';
        renderReports();
    }
}

// ===================== TAREFAS (FIRESTORE) =====================

function loadTasks() {
    const q = query(
        collection(db, 'tarefas'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        tasksCache = [];
        snapshot.forEach((docSnap) => {
            const data = { id: docSnap.id, ...docSnap.data() };
            data.status = data.status || (data.completed ? 'done' : 'pending');
            data.priority = data.priority || 'medium';
            data.recurrence = data.recurrence || 'none';
            tasksCache.push(data);
        });

        if (currentView === 'kanban') renderFilteredBoard();
        if (currentView === 'agenda') renderAgenda();
        if (currentView === 'reports') renderReports();

    }, (error) => {
        console.error('Firestore onSnapshot error:', error);
        showToast('Erro ao carregar tarefas ❌', true);
    });
}

// ===================== KANBAN COM FILTROS =====================

filterPriority.addEventListener('change', () => {
    activeFilters.priority = filterPriority.value;
    renderFilteredBoard();
});
filterCategory.addEventListener('change', () => {
    activeFilters.category = filterCategory.value;
    renderFilteredBoard();
});
btnClearFilters.addEventListener('click', () => {
    activeFilters = { priority: '', category: '' };
    filterPriority.value = '';
    filterCategory.value = '';
    renderFilteredBoard();
});

function renderFilteredBoard() {
    clearLists();

    const filtered = tasksCache.filter(t => {
        if (activeFilters.priority && t.priority !== activeFilters.priority) return false;
        if (activeFilters.category && getCategory(t.title) !== activeFilters.category) return false;
        return true;
    });

    let pending = 0, doing = 0, done = 0;
    const today = toDateValue(new Date());

    filtered.forEach(data => {
        const eff = effectiveStatus(data);

        // Tarefas recorrentes: só mostrar no Kanban se a data de início já passou
        if (data.recurrence !== 'none' && data.date > today) return;

        if (eff === 'done' || eff === 'done_today') {
            done++;
            renderTask(data.id, data, listDone, eff);
        } else if (eff === 'doing') {
            doing++;
            renderTask(data.id, data, listDoing, eff);
        } else {
            pending++;
            renderTask(data.id, data, listPending, eff);
        }
    });

    countPending.textContent = pending;
    countDoing.textContent = doing;
    countDone.textContent = done;
}

function renderTask(id, data, container, eff) {
    const taskDateTime = new Date(`${data.date}T${data.time || '00:00'}`);
    const now = new Date();
    const status = eff || effectiveStatus(data);
    const priority = data.priority || 'medium';
    const recurrence = data.recurrence || 'none';
    const overdue = status !== 'done' && status !== 'done_today' && taskDateTime < now;
    const isToday = taskDateTime.toDateString() === now.toDateString();
    const isDone = status === 'done' || status === 'done_today';

    const dateDisplay = isToday
        ? 'Hoje'
        : taskDateTime.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    const priorityLabel = { high: '🔴 Alta', medium: '🟡 Média', low: '🟢 Baixa' };
    const recurrenceLabel = {
        daily: '🔁 Diária',
        weekly: '📅 Semanal',
        monthly: '🗓️ Mensal',
    };
    const category = getCategory(data.title);

    let actionButtons = '';
    if (isDone) {
        actionButtons = `
            <button class="action-btn back-btn" title="${recurrence !== 'none' ? 'Reabrir' : 'Reabrir'}">
                <i class="ph-bold ph-arrow-counter-clockwise"></i>
            </button>`;
    } else if (status === 'pending') {
        actionButtons = `
            <button class="action-btn focus-btn" title="Mover para Em Foco"><i class="ph-bold ph-lightning"></i></button>
            <button class="action-btn check-btn" title="Concluir"><i class="ph-bold ph-check"></i></button>`;
    } else if (status === 'doing') {
        actionButtons = `
            <button class="action-btn back-btn" title="Voltar para Pendentes"><i class="ph-bold ph-arrow-left"></i></button>
            <button class="action-btn check-btn" title="Concluir"><i class="ph-bold ph-check"></i></button>`;
    }

    const card = document.createElement('div');
    card.className = `task-card${overdue ? ' overdue' : ''}${isDone ? ' done' : ''}`;
    card.dataset.id = id;

    card.innerHTML = `
        <div class="card-badges">
            <span class="priority-badge ${priority}">${priorityLabel[priority]}</span>
            ${recurrence !== 'none' ? `<span class="recurrence-badge">${recurrenceLabel[recurrence]}</span>` : ''}
        </div>
        <div class="task-category">
            <i class="${getCategoryIcon(category)}"></i> ${category}
        </div>
        <div class="task-title">${data.title}</div>
        ${data.description ? `<div class="task-desc">${data.description}</div>` : ''}
        <div class="task-meta">
            <div class="task-date">
                <i class="ph ph-calendar-blank"></i>
                ${recurrence !== 'none' ? recurrenceLabel[recurrence] + ' · ' : ''}${dateDisplay} ${data.time || ''}
            </div>
            <div class="task-actions">
                <button class="action-btn edit-btn" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                ${actionButtons}
                <button class="action-btn delete-btn" title="Apagar"><i class="ph ph-trash"></i></button>
            </div>
        </div>
    `;

    card.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation(); openTaskModal(id);
    });
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation(); deleteTask(id, card);
    });

    if (isDone) {
        card.querySelector('.back-btn').addEventListener('click', (e) => {
            e.stopPropagation(); reopenTask(id, data);
        });
    } else if (status === 'pending') {
        card.querySelector('.focus-btn').addEventListener('click', (e) => { e.stopPropagation(); moveTask(id, 'doing', data); });
        card.querySelector('.check-btn').addEventListener('click', (e) => { e.stopPropagation(); completeTask(id, data); });
    } else if (status === 'doing') {
        card.querySelector('.back-btn').addEventListener('click', (e) => { e.stopPropagation(); moveTask(id, 'pending', data); });
        card.querySelector('.check-btn').addEventListener('click', (e) => { e.stopPropagation(); completeTask(id, data); });
    }

    container.appendChild(card);
}

// ===================== AGENDA =====================

agendaPrev.addEventListener('click', () => { agendaWeekOffset--; renderAgenda(); });
agendaNext.addEventListener('click', () => { agendaWeekOffset++; renderAgenda(); });
agendaToday.addEventListener('click', () => { agendaWeekOffset = 0; renderAgenda(); });

function renderAgenda() {
    agendaContainer.innerHTML = '';

    const today = new Date();
    const weekStart = new Date(today);
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
    weekStart.setDate(today.getDate() - dayOfWeek + agendaWeekOffset * 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    if (agendaWeekOffset === 0) agendaRangeLabel.textContent = `Esta semana (${fmt(weekStart)} – ${fmt(weekEnd)})`;
    else if (agendaWeekOffset === 1) agendaRangeLabel.textContent = `Próxima semana (${fmt(weekStart)} – ${fmt(weekEnd)})`;
    else if (agendaWeekOffset === -1) agendaRangeLabel.textContent = `Semana passada (${fmt(weekStart)} – ${fmt(weekEnd)})`;
    else agendaRangeLabel.textContent = `${fmt(weekStart)} – ${fmt(weekEnd)}`;

    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dayStr = toDateValue(day);
        const isToday = dayStr === toDateValue(today);

        // Tarefas diretas do dia + recorrentes que caem nesse dia
        const dayTasks = tasksCache
            .filter(t => {
                if (t.date === dayStr) return true;                      // tarefa normal neste dia
                if (isRecurringActiveOnDate(t, dayStr)) return true;     // recorrente ativa neste dia
                return false;
            })
            .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));

        const dayEl = document.createElement('div');
        dayEl.className = 'agenda-day';

        dayEl.innerHTML = `
            <div class="agenda-day-header ${isToday ? 'today' : ''}">
                <div class="day-label">
                    <div class="day-dot"></div>
                    <span class="day-name">${weekdays[day.getDay()]}, ${day.getDate()} ${months[day.getMonth()]}</span>
                </div>
                <span class="day-count">${dayTasks.length} tarefa${dayTasks.length !== 1 ? 's' : ''}</span>
            </div>
        `;

        if (dayTasks.length === 0) {
            dayEl.innerHTML += `<div class="agenda-empty">Nenhuma tarefa</div>`;
        } else {
            dayTasks.forEach(task => {
                const now = new Date();
                const taskDT = new Date(`${task.date}T${task.time || '00:00'}`);
                const isRecurr = task.recurrence && task.recurrence !== 'none';

                // Status efetivo para recorrentes na agenda: completado neste dia específico?
                let taskStatus = task.status;
                if (isRecurr) {
                    taskStatus = task.lastCompletedDate === dayStr ? 'done' : (task.status === 'done' ? 'pending' : task.status);
                }

                const overdue = taskStatus !== 'done' && taskDT < now;
                const dotClass = overdue ? 'overdue' : taskStatus;
                const titleClass = taskStatus === 'done' ? 'done-title' : '';
                const category = getCategory(task.title);
                const recLabel = { daily: '🔁', weekly: '📅', monthly: '🗓️' };

                const item = document.createElement('div');
                item.className = 'agenda-item';
                item.innerHTML = `
                    <span class="agenda-item-time">${task.time || '--:--'}</span>
                    <div class="agenda-item-dot ${dotClass}"></div>
                    <div class="agenda-item-info">
                        <div class="agenda-item-title ${titleClass}">
                            ${isRecurr ? `<span class="agenda-recurrence-icon">${recLabel[task.recurrence]}</span> ` : ''}${task.title}
                        </div>
                        <div class="agenda-item-meta">${category}${task.description ? ' · ' + task.description.substring(0, 40) : ''}</div>
                    </div>
                    <div class="agenda-item-actions">
                        <button class="action-btn edit-btn" title="Editar"><i class="ph ph-pencil-simple"></i></button>
                        <button class="action-btn ${taskStatus === 'done' ? 'back-btn' : 'check-btn'}" title="${taskStatus === 'done' ? 'Reabrir' : 'Concluir'}">
                            <i class="ph-bold ${taskStatus === 'done' ? 'ph-arrow-counter-clockwise' : 'ph-check'}"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Apagar"><i class="ph ph-trash"></i></button>
                    </div>
                `;

                item.querySelector('.edit-btn').addEventListener('click', (e) => {
                    e.stopPropagation(); openTaskModal(task.id);
                });
                const actionBtn = item.querySelector(taskStatus === 'done' ? '.back-btn' : '.check-btn');
                actionBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (taskStatus === 'done') {
                        reopenTask(task.id, task);
                    } else {
                        completeTask(task.id, task);
                    }
                });
                item.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation(); deleteTask(task.id, null);
                });

                dayEl.appendChild(item);
            });
        }

        agendaContainer.appendChild(dayEl);
    }
}

// ===================== RELATÓRIOS =====================

function renderReports() {
    const now = new Date();
    let done = 0, pending = 0, doing = 0, overdue = 0;
    const catMap = {};

    tasksCache.forEach(t => {
        const cat = getCategory(t.title);
        catMap[cat] = (catMap[cat] || 0) + 1;
        const eff = effectiveStatus(t);

        if (eff === 'done' || eff === 'done_today') { done++; return; }
        if (eff === 'doing') doing++;
        else pending++;

        const dt = new Date(`${t.date}T${t.time || '00:00'}`);
        if (dt < now) overdue++;
    });

    document.getElementById('stat-done').textContent = done;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-overdue').textContent = overdue;
    document.getElementById('stat-doing').textContent = doing;

    const total = tasksCache.length || 1;
    const catStats = document.getElementById('category-stats');
    catStats.innerHTML = '';

    Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
            const pct = Math.round((count / total) * 100);
            catStats.innerHTML += `
                <div class="cat-stat-row">
                    <span class="cat-stat-name"><i class="${getCategoryIcon(cat)}"></i> ${cat}</span>
                    <div class="cat-stat-bar-wrap">
                        <div class="cat-stat-bar" style="width:${pct}%"></div>
                    </div>
                    <span class="cat-stat-count">${count}</span>
                </div>`;
        });
}

// ===================== MODAL =====================

// Mostrar/ocultar hint de recorrência
modalTaskRecurrence.addEventListener('change', () => {
    const isRecurring = modalTaskRecurrence.value !== 'none';
    recurrenceHint.classList.toggle('hidden', !isRecurring);
});

btnNewTask.addEventListener('click', () => openTaskModal(null));
document.getElementById('btn-add-col')?.addEventListener('click', () => openTaskModal(null));
btnModalClose.addEventListener('click', closeModal);
btnModalCancel.addEventListener('click', closeModal);
taskModal.addEventListener('click', (e) => { if (e.target === taskModal) closeModal(); });

function openTaskModal(taskId) {
    modalTaskId.value = taskId || '';

    if (taskId) {
        modalTitleEl.textContent = 'Editar Tarefa';
        const task = tasksCache.find(t => t.id === taskId);
        if (!task) return;
        modalTaskTitle.value = task.title || '';
        modalTaskDesc.value = task.description || '';
        modalTaskDate.value = task.date || '';
        modalTaskTime.value = task.time || '';
        modalTaskPriority.value = task.priority || 'medium';
        modalTaskStatus.value = task.status || 'pending';
        modalTaskRecurrence.value = task.recurrence || 'none';
    } else {
        modalTitleEl.textContent = 'Nova Tarefa';
        modalForm.reset();
        modalTaskDate.value = toDateValue(new Date());
        modalTaskPriority.value = 'medium';
        modalTaskStatus.value = 'pending';
        modalTaskRecurrence.value = 'none';
    }

    const isRecurring = modalTaskRecurrence.value !== 'none';
    recurrenceHint.classList.toggle('hidden', !isRecurring);

    taskModal.classList.remove('hidden');
    setTimeout(() => modalTaskTitle.focus(), 100);
}

function closeModal() {
    taskModal.classList.add('hidden');
}

modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const taskId = modalTaskId.value;
    const title = modalTaskTitle.value.trim();
    const description = modalTaskDesc.value.trim();
    const date = modalTaskDate.value;
    const time = modalTaskTime.value;
    const priority = modalTaskPriority.value;
    const status = modalTaskStatus.value;
    const recurrence = modalTaskRecurrence.value || 'none';

    if (!title || !date) return;
    closeModal();

    const payload = {
        title, description, date, time, priority, status, recurrence,
        completed: status === 'done',
    };

    try {
        if (taskId) {
            await updateDoc(doc(db, 'tarefas', taskId), payload);
            showToast('Tarefa atualizada ✅');
        } else {
            await addDoc(collection(db, 'tarefas'), {
                ...payload,
                userId: currentUser.uid,
                createdAt: serverTimestamp(),
            });
            showToast(recurrence !== 'none' ? 'Tarefa recorrente criada! 🔁' : 'Tarefa adicionada! 🚀');
        }
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar ❌', true);
    }
});

// ===================== AÇÕES DE TAREFA =====================

async function saveTaskToDB(taskObj) {
    if (!currentUser) return;
    try {
        await addDoc(collection(db, 'tarefas'), {
            ...taskObj,
            userId: currentUser.uid,
            completed: false,
            status: 'pending',
            priority: 'medium',
            createdAt: serverTimestamp(),
        });
        const rec = taskObj.recurrence && taskObj.recurrence !== 'none';
        showToast(rec ? 'Tarefa recorrente criada! 🔁' : 'Tarefa adicionada! 🚀');
    } catch (e) {
        console.error('Erro ao salvar:', e);
        showToast('Erro ao salvar! ❌', true);
    }
}

async function deleteTask(id, cardElement) {
    if (cardElement) {
        cardElement.style.transition = '0.3s';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.9)';
        await sleep(300);
    }
    try { await deleteDoc(doc(db, 'tarefas', id)); }
    catch (e) { console.error(e); }
}

/**
 * Conclui uma tarefa.
 * - Normal:     marca como status='done', completed=true
 * - Recorrente: grava lastCompletedDate=hoje, mantém status='pending'
 */
async function completeTask(id, data) {
    const isRecurring = data.recurrence && data.recurrence !== 'none';
    try {
        if (isRecurring) {
            await updateDoc(doc(db, 'tarefas', id), {
                lastCompletedDate: toDateValue(new Date()),
                // status permanece como estava (ou pending se estava como done)
                status: data.status === 'done' ? 'pending' : data.status,
            });
            showToast('Concluída por hoje! 🔁 Volta amanhã.');
        } else {
            await updateDoc(doc(db, 'tarefas', id), { status: 'done', completed: true });
        }
    } catch (e) {
        console.error(e);
        showToast('Erro ao concluir ❌', true);
    }
}

/**
 * Reabre uma tarefa (normal ou recorrente).
 */
async function reopenTask(id, data) {
    const isRecurring = data.recurrence && data.recurrence !== 'none';
    try {
        if (isRecurring) {
            await updateDoc(doc(db, 'tarefas', id), { lastCompletedDate: '' });
        } else {
            await updateDoc(doc(db, 'tarefas', id), { status: 'pending', completed: false });
        }
    } catch (e) { console.error(e); }
}

async function moveTask(id, newStatus, data) {
    // Recorrentes não podem ser movidas para "done" por aqui, use completeTask
    if (data && data.recurrence !== 'none' && newStatus === 'done') {
        return completeTask(id, data);
    }
    try {
        await updateDoc(doc(db, 'tarefas', id), {
            status: newStatus,
            completed: newStatus === 'done',
        });
    } catch (e) {
        console.error('Erro ao mover tarefa:', e);
        showToast('Erro ao mover tarefa ❌', true);
    }
}

// ===================== CHAT IA =====================

const aiInput = document.getElementById('ai-input');
const btnSendAi = document.getElementById('btn-send-ai');

btnSendAi.addEventListener('click', handleAiInput);
aiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAiInput(); });

async function handleAiInput() {
    const text = aiInput.value.trim();
    if (!text) { aiInput.focus(); return; }

    btnSendAi.disabled = true;
    btnSendAi.innerHTML = '<i class="ph ph-spinner-gap spin"></i>';
    aiInput.value = '';

    const parsed = parseTaskFromText(text);
    await saveTaskToDB(parsed);

    btnSendAi.disabled = false;
    btnSendAi.innerHTML = '<i class="ph ph-paper-plane-right"></i>';
    aiInput.focus();
}

// ===================== NOTIFICAÇÕES =====================

btnPermNotif.addEventListener('click', async () => {
    if (!('Notification' in window)) {
        showToast('Navegador não suporta notificações ⚠️', true);
        return;
    }
    if (Notification.permission === 'granted') {
        sendNotification('🔔 AppAlerta — Ativo', { body: 'As notificações estão ligadas.', icon: './icon-192.svg' });
        return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') { setNotifActive(true); startNotificationLoop(); }
});

function setNotifActive(active) {
    notifIcon.className = active ? 'ph-fill ph-bell-ringing' : 'ph ph-bell';
}

function startNotificationLoop() {
    if (notifInterval) clearInterval(notifInterval);
    notifInterval = setInterval(checkNotifications, 10_000);
    checkNotifications();
}

// Ouve mensagens vindas do Service Worker (ações dos botões de notificação)
if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', async (event) => {
        const { type, taskId, taskKey, recurrence, status } = event.data || {};

        if (type === 'COMPLETE_TASK' && taskId) {
            const task = tasksCache.find(t => t.id === taskId);
            if (task) {
                await completeTask(taskId, task);
            } else {
                // Tarefa não em cache ainda — tenta concluir diretamente
                const isRecurring = recurrence && recurrence !== 'none';
                try {
                    if (isRecurring) {
                        await updateDoc(doc(db, 'tarefas', taskId), {
                            lastCompletedDate: toDateValue(new Date()),
                            status: status === 'done' ? 'pending' : (status || 'pending'),
                        });
                    } else {
                        await updateDoc(doc(db, 'tarefas', taskId), { status: 'done', completed: true });
                    }
                    showToast('Tarefa concluída pela notificação ✅');
                } catch (e) {
                    console.error('Erro ao concluir pela notificação:', e);
                }
            }
        }

        if (type === 'SNOOZE_TASK' && taskKey) {
            // Remove a chave para que a notificação possa ser disparada novamente
            notifiedTasks.delete(taskKey);
            showToast('Lembrete adiado por 10 minutos ⏰');
        }
    });
}

function checkNotifications() {
    const now = new Date();
    const today = toDateValue(now);
    const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    tasksCache.forEach(task => {
        const eff = effectiveStatus(task);
        if (eff === 'done' || eff === 'done_today') return;

        // Para recorrentes, notificar apenas se ativa hoje
        if (task.recurrence !== 'none' && !isRecurringActiveOnDate(task, today)) return;
        // Para normais, só notificar no dia exato
        if (task.recurrence === 'none' && task.date !== today) return;

        const taskTime = (task.time || '00:00').substring(0, 5);
        const [tHH, tMM] = taskTime.split(':').map(Number);
        const taskSecs = tHH * 3600 + tMM * 60;
        const diff = nowSecs - taskSecs;
        if (diff < -5 || diff > 60) return;

        const key = `${task.id}-${today}-${taskTime}`;
        if (notifiedTasks.has(key)) return;

        notifiedTasks.add(key);
        sendNotification('⏰ AppAlerta — Lembrete!', {
            body: task.title,
            icon: './icon-192.svg',
            tag: key,
            requireInteraction: true,
            vibrate: [500, 250, 500],
            data: { taskId: task.id, taskKey: key, recurrence: task.recurrence || 'none', status: task.status },
            actions: [
                { action: 'complete', title: '✅ Concluir' },
                { action: 'snooze', title: '⏰ Adiar 10 min' },
            ],
        });
    });
}

// ===================== HELPERS =====================

function getCategory(title) {
    const t = title.toLowerCase();
    if (t.includes('marketing') || t.includes('ads') || t.includes('post')) return 'Marketing';
    if (t.includes('reunião') || t.includes('call') || t.includes('encontro') || t.includes('meeting')) return 'Meeting';
    if (t.includes('design') || t.includes('logo') || t.includes('layout')) return 'Design';
    if (t.includes('dev') || t.includes('bug') || t.includes('código') || t.includes('code')) return 'Development';
    return 'Geral';
}

function getCategoryIcon(cat) {
    switch (cat) {
        case 'Marketing': return 'ph-fill ph-megaphone';
        case 'Meeting': return 'ph-fill ph-users';
        case 'Design': return 'ph-fill ph-palette';
        case 'Development': return 'ph-fill ph-code';
        default: return 'ph-fill ph-clipboard-text';
    }
}

function showToast(msg, isError = false) {
    toastMsg.textContent = msg;
    toast.classList.toggle('error', isError);
    toast.classList.remove('hidden');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function toDateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sendNotification(title, options) {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, options));
    } else {
        // new Notification() não suporta 'actions' — remove antes de criar
        const { actions: _ignored, ...safeOptions } = options || {};
        new Notification(title, safeOptions);
    }
}
