import { db, auth } from './firebase-config.js';
import {
    collection, addDoc, onSnapshot, query, where,
    orderBy, deleteDoc, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    onAuthStateChanged, signOut
} from "firebase-config.js";
import { parseTaskFromText } from './ai-parser.js';

// ===================== ELEMENTOS DA UI =====================
const loginOverlay = document.getElementById('login-overlay');
const appMain = document.getElementById('app-main');
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
const btnLogout = document.getElementById('btn-logout');
const btnPermNotif = document.getElementById('btn-perm-notif');
const notifIcon = document.getElementById('notif-icon');

const taskList = document.getElementById('task-list');
const loader = document.getElementById('loader');
const emptyState = document.getElementById('empty-state');
const aiInput = document.getElementById('ai-input');
const btnSendAi = document.getElementById('btn-send-ai');
const manualForm = document.getElementById('manual-form');
const manWrapper = document.getElementById('manual-form-wrapper');
const btnTogglMan = document.getElementById('btn-toggle-manual');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const countPending = document.getElementById('count-pending');
const countDone = document.getElementById('count-done');

let currentUser = null;
let isLoginMode = true;
let unsubscribeSnapshot = null;

// ===================== AUTENTICAÇÃO =====================

// Toggle mostrar/esconder senha
btnTogglePass.addEventListener('click', () => {
    const isPass = authPassword.type === 'password';
    authPassword.type = isPass ? 'text' : 'password';
    passEyeIcon.className = isPass ? 'ph ph-eye-slash' : 'ph ph-eye';
});

// Alternar Login ↔ Cadastro — FIX: sem arguments.callee (deprecado)
authToggleBtn.addEventListener('click', toggleAuthMode);

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        btnLoginText.textContent = 'Entrar';
        authToggleText.textContent = 'Não tem uma conta?';
        authToggleBtn.textContent = 'Cadastre-se';
        authSubtitle.textContent = 'Entre para gerenciar suas tarefas com IA';
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

// Submeter Form
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

// Logout
btnLogout.addEventListener('click', () => { signOut(auth); });

// Observer de Estado
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        // Exibe só a parte antes do @ no displayName
        const name = user.displayName || user.email.split('@')[0];
        userDisplayName.textContent = `Olá, ${name}`;

        loginOverlay.classList.remove('active');
        appMain.classList.remove('hidden');
        loadTasks();

        // Notificações: inicializa silenciosamente se já ativas
        if ("Notification" in window && Notification.permission === "granted") {
            notifIcon.className = 'ph-fill ph-bell-ringing';
            btnPermNotif.classList.add('active');
            startNotificationLoop();
        }
    } else {
        currentUser = null;
        if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
        loginOverlay.classList.add('active');
        appMain.classList.add('hidden');
        taskList.innerHTML = '';
    }
});

// ===================== TAREFAS (FIRESTORE) =====================

// Cache local das tarefas (para notificações sem re-query)
let tasksCache = [];

function loadTasks() {
    loader.style.display = 'flex';
    emptyState.classList.add('hidden');
    taskList.style.display = 'none';

    const q = query(
        collection(db, 'tarefas'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        loader.style.display = 'none';
        taskList.innerHTML = '';
        tasksCache = [];

        if (snapshot.empty) {
            emptyState.classList.remove('hidden');
            taskList.style.display = 'none';
            countPending.textContent = '0';
            countDone.textContent = '0';
            return;
        }

        emptyState.classList.add('hidden');
        taskList.style.display = '';

        let pending = 0, done = 0;

        snapshot.forEach((docSnap) => {
            const data = { id: docSnap.id, ...docSnap.data() };
            tasksCache.push(data);
            if (data.completed) done++; else pending++;
            renderTask(docSnap.id, data);
        });

        countPending.textContent = pending;
        countDone.textContent = done;
    }, (error) => {
        console.error('Firestore onSnapshot error:', error);
        loader.style.display = 'none';
        showToast('Erro ao carregar tarefas ❌', true);
    });
}

// Renderizar Card
function renderTask(id, data) {
    const li = document.createElement('li');

    // Detectar se está em atraso (data + hora < agora, e não concluída)
    const taskDateTime = new Date(`${data.date}T${data.time || '00:00'}`);
    const now = new Date();
    const overdue = !data.completed && taskDateTime < now;
    const isToday = taskDateTime.toDateString() === now.toDateString();

    let dateDisplay;
    if (isToday) {
        dateDisplay = 'Hoje';
    } else {
        dateDisplay = taskDateTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    }

    li.className = `task-card ${data.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}`;
    li.dataset.id = id;
    // Armazena tempo p/ notificação
    li.dataset.date = data.date || '';
    li.dataset.time = data.time || '';

    const check = document.createElement('div');
    check.className = 'task-check';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', data.completed ? 'true' : 'false');
    check.title = data.completed ? 'Marcar como pendente' : 'Concluir tarefa';
    check.innerHTML = '<i class="ph-bold ph-check"></i>';
    check.addEventListener('click', () => toggleTaskStatus(id, !data.completed));

    const content = document.createElement('div');
    content.className = 'task-content';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = data.title; // Seguro — não usa innerHTML aqui

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.innerHTML = `
        <span class="task-meta-item">
            <i class="ph ph-calendar-blank"></i>
            ${dateDisplay}
        </span>
        ${data.time ? `<span class="task-meta-item">
            <i class="ph ph-clock"></i>
            ${data.time}
        </span>` : ''}
        ${overdue ? `<span class="task-meta-item" style="color:var(--danger)">
            <i class="ph ph-warning-circle"></i> Atrasada
        </span>` : ''}
    `;

    content.appendChild(title);
    content.appendChild(meta);

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = 'Apagar tarefa';
    delBtn.innerHTML = '<i class="ph ph-trash"></i>';
    delBtn.addEventListener('click', () => deleteTask(id, li));

    li.appendChild(check);
    li.appendChild(content);
    li.appendChild(delBtn);
    taskList.appendChild(li);
}

// ===================== AÇÕES DE TAREFA =====================

async function saveTaskToDB(taskObj) {
    if (!currentUser) return;
    try {
        await addDoc(collection(db, 'tarefas'), {
            ...taskObj,
            userId: currentUser.uid,
            completed: false,
            createdAt: serverTimestamp(),
        });
        showToast('Tarefa salva na nuvem ☁️');
    } catch (e) {
        console.error('Erro ao salvar:', e);
        showToast('Erro ao salvar! ❌', true);
    }
}

async function deleteTask(id, liElement) {
    // Animação de saída antes de deletar
    if (liElement) {
        liElement.style.transition = 'all 0.25s ease';
        liElement.style.opacity = '0';
        liElement.style.transform = 'translateX(20px)';
        await sleep(220);
    }
    try { await deleteDoc(doc(db, 'tarefas', id)); }
    catch (e) { console.error(e); }
}

async function toggleTaskStatus(id, isCompleted) {
    try { await updateDoc(doc(db, 'tarefas', id), { completed: isCompleted }); }
    catch (e) { console.error(e); }
}

// ===================== CHAT IA =====================

btnSendAi.addEventListener('click', handleAiInput);
aiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAiInput(); });

async function handleAiInput() {
    const text = aiInput.value.trim();
    if (!text) { aiInput.focus(); return; }

    // Feedback visual
    btnSendAi.disabled = true;
    btnSendAi.innerHTML = '<i class="ph ph-spinner-gap spin"></i>';
    aiInput.value = '';

    // Leve delay artificial para parecer processamento
    await sleep(400);

    const parsed = parseTaskFromText(text);
    await saveTaskToDB(parsed);

    btnSendAi.disabled = false;
    btnSendAi.innerHTML = '<i class="ph-fill ph-paper-plane-right"></i>';
    aiInput.focus();
}

// ===================== FORMULÁRIO MANUAL =====================

let manualOpen = false;

btnTogglMan.addEventListener('click', () => {
    manualOpen = !manualOpen;
    if (manualOpen) {
        manWrapper.classList.remove('collapsed');
        btnTogglMan.classList.add('open');
        // Preencher com data/hora atual
        const now = new Date();
        document.getElementById('man-date').value = toDateValue(now);
        document.getElementById('man-time').value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        document.getElementById('man-title').focus();
    } else {
        manWrapper.classList.add('collapsed');
        btnTogglMan.classList.remove('open');
    }
});

manualForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('man-title').value.trim();
    const date = document.getElementById('man-date').value;
    const time = document.getElementById('man-time').value;

    if (!title) return;
    await saveTaskToDB({ title, date, time });
    document.getElementById('man-title').value = '';

    // Fechar form após salvar
    manWrapper.classList.add('collapsed');
    btnTogglMan.classList.remove('open');
    manualOpen = false;
});

// ===================== NOTIFICAÇÕES =====================

btnPermNotif.addEventListener('click', async () => {
    if (!('Notification' in window)) {
        showToast('Navegador não suporta notificações ⚠️', true);
        return;
    }

    // Se já ativado: clique no sino dispara notificação de teste imediata
    if (Notification.permission === 'granted') {
        sendNotification('🔔 AppAlerta — Teste', {
            body: 'Notificações estão funcionando corretamente!',
            icon: './icon-192.svg',
            tag: 'test-notif',
        });
        showToast('Notificação de teste enviada!');
        return;
    }

    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
        setNotifActive(true);
        showToast('Notificações ativadas! 🔔');
        // Dispara uma notificação de boas-vindas imediata para confirmar
        sendNotification('🔔 AppAlerta ativado!', {
            body: 'Você receberá lembretes nos horários das suas tarefas.',
            icon: './icon-192.svg',
            tag: 'welcome-notif',
        });
        startNotificationLoop();
    } else {
        showToast('Permissão negada — ative nas configurações do navegador ⚠️', true);
    }
});

function setNotifActive(active) {
    notifIcon.className = active ? 'ph-fill ph-bell-ringing' : 'ph ph-bell';
    btnPermNotif.classList.toggle('active', active);
}

let notifInterval = null;
const notifiedTasks = new Set(); // Evita disparar a mesma notificação mais de uma vez

function startNotificationLoop() {
    if (notifInterval) clearInterval(notifInterval);
    // Checar a cada 10 segundos para não perder a janela do minuto
    notifInterval = setInterval(checkNotifications, 10_000);
    // Checar imediatamente ao iniciar (não esperar os primeiros 10s)
    checkNotifications();
}

function checkNotifications() {
    const now = new Date();
    const today = toDateValue(now);
    // Janela de 60 segundos: se estiver dentro do minuto correto, notifica
    // Isso resolve o problema de o intervalo não pegar exatamente o segundo certo
    const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    tasksCache.forEach(task => {
        if (task.completed) return;
        if (task.date !== today) return;

        const taskTime = (task.time || '00:00').substring(0, 5);
        const [tHH, tMM] = taskTime.split(':').map(Number);
        const taskSecs = tHH * 3600 + tMM * 60;

        // Janela: dispara se o horário da tarefa estiver entre -5s e +60s do agora
        const diff = nowSecs - taskSecs;
        if (diff < -5 || diff > 60) return;

        // Chave única: id + data + HH:MM para evitar spam
        const key = `${task.id}-${today}-${taskTime}`;
        if (notifiedTasks.has(key)) return;

        notifiedTasks.add(key);
        if (notifiedTasks.size > 200) notifiedTasks.clear();

        sendNotification('⏰ AppAlerta — Lembrete!', {
            body: task.title,
            icon: './icon-192.svg',
            badge: './icon-192.svg', // Ajuda a aparecer na barra de status do Android
            tag: key,
            requireInteraction: true, // Força a notificação a ficar na tela até o usuário fechar/clicar
            vibrate: [500, 250, 500, 250, 500, 250, 1000], // Padrão agressivo: vibra, pausa, vibra...
        });
    });
}

// ===================== HELPERS =====================

function showToast(msg, isError = false) {
    toastMsg.textContent = msg;
    toast.classList.toggle('error', isError);
    toast.querySelector('.toast-icon').className =
        isError ? 'ph ph-warning-circle toast-icon' : 'ph ph-check-circle toast-icon';
    toast.classList.remove('hidden');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDateValue(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Função centralizada para disparar notificações com suporte a Android (via Service Worker)
function sendNotification(title, options) {
    if (navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(function (registration) {
            registration.showNotification(title, options);
        });
    } else {
        new Notification(title, options);
    }
}
