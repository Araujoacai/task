import { db, auth } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { parseTaskFromText } from './ai-parser.js';

// === ELEMENTOS DA UI ===
const loginOverlay = document.getElementById('login-overlay');
const appMain = document.getElementById('app-main');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');
const authError = document.getElementById('auth-error');
const userDisplayName = document.getElementById('user-display-name');
const btnLogout = document.getElementById('btn-logout');

const taskList = document.getElementById('task-list');
const loader = document.getElementById('loader');
const aiInput = document.getElementById('ai-input');
const btnSendAi = document.getElementById('btn-send-ai');
const manualForm = document.getElementById('manual-form');
const btnToggleManual = document.getElementById('btn-toggle-manual');
const btnPermNotif = document.getElementById('btn-perm-notif');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');

let currentUser = null;
let isLoginMode = true;
let unsubscribeSnapshot = null;

// === AUTENTICAÇÃO ===

// Alternar entre Login e Cadastro
authToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        btnLogin.textContent = 'Entrar';
        authToggleText.innerHTML = 'Não tem uma conta? <a href="#" id="auth-toggle-btn">Cadastre-se</a>';
    } else {
        btnLogin.textContent = 'Criar Conta';
        authToggleText.innerHTML = 'Já tem uma conta? <a href="#" id="auth-toggle-btn">Faça Login</a>';
    }
    // Re-bind click devido ao innerHTML
    document.getElementById('auth-toggle-btn').addEventListener('click', arguments.callee);
});

// Submeter Form de Autenticação
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<i class="ph ph-spinner-gap spin"></i>';

    const email = authEmail.value;
    const password = authPassword.value;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
        }
        authEmail.value = ''; authPassword.value = '';
    } catch (error) {
        let msg = "Erro desconhecido.";
        if (error.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
        if (error.code === 'auth/email-already-in-use') msg = "E-mail já cadastrado.";
        if (error.code === 'auth/weak-password') msg = "Senha muito fraca.";
        authError.textContent = msg;
        authError.classList.remove('hidden');
    }

    btnLogin.disabled = false;
    btnLogin.textContent = isLoginMode ? 'Entrar' : 'Criar Conta';
});

// Deslogar
btnLogout.addEventListener('click', () => {
    signOut(auth);
});

// Observador de Estado de Autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userDisplayName.textContent = user.email.split('@')[0];
        // Esconde Login, Mostra Main
        loginOverlay.classList.remove('active');
        appMain.classList.remove('hidden');
        loadTasks();
    } else {
        currentUser = null;
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        // Mostra Login, Esconde Main
        loginOverlay.classList.add('active');
        appMain.classList.add('hidden');
        taskList.innerHTML = "";
    }
});

// === TAREFAS (FIRESTORE) ===

// Carregar Dados em Tempo Real
function loadTasks() {
    loader.style.display = 'flex';

    const tasksRef = collection(db, "tarefas");
    const q = query(
        tasksRef,
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc")
    );

    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        loader.style.display = 'none';
        taskList.innerHTML = '';

        if (snapshot.empty) {
            taskList.innerHTML = '<li style="text-align:center; color: var(--text-muted); margin-top: 20px;">Nenhuma tarefa pendente.</li>';
            return;
        }

        snapshot.forEach((doc) => {
            renderTask(doc.id, doc.data());
        });
    }, (error) => {
        console.error("Erro no onSnapshot:", error);
    });
}

// Renderizar uma Tarefa no DOM
function renderTask(id, data) {
    const li = document.createElement('li');
    li.className = `task-card ${data.completed ? 'completed' : ''}`;
    li.dataset.id = id;

    // Formatação Simples de Data e Hora
    const dateObj = new Date(data.date + 'T' + (data.time || '00:00'));
    const isToday = dateObj.toDateString() === new Date().toDateString();
    const dateDisplay = isToday ? 'Hoje' : dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    li.innerHTML = `
        <div class="custom-checkbox" onclick="toggleTaskStatus('${id}', ${!data.completed})">
            <i class="ph-bold ph-check"></i>
        </div>
        <div class="task-content">
            <div class="task-title">${data.title}</div>
            <div class="task-meta">
                <span><i class="ph ph-calendar-blank"></i> ${dateDisplay}</span>
                ${data.time ? `<span><i class="ph ph-clock"></i> ${data.time}</span>` : ''}
            </div>
        </div>
        <button class="delete-btn" onclick="deleteTask('${id}')">
            <i class="ph ph-trash"></i>
        </button>
    `;
    taskList.appendChild(li);
}

// === AÇÕES DE TAREFA ===

// Salvar no Firebase
async function saveTaskToDB(taskObj) {
    if (!currentUser) return;

    try {
        await addDoc(collection(db, "tarefas"), {
            ...taskObj,
            userId: currentUser.uid,
            completed: false,
            createdAt: serverTimestamp()
        });
        showToast("Tarefa enviada para a nuvem! ☁️");
    } catch (e) {
        console.error("Erro ao adicionar documento: ", e);
        showToast("Erro ao salvar! ❌");
    }
}

// Deletar
window.deleteTask = async (id) => {
    try { await deleteDoc(doc(db, "tarefas", id)); } catch (e) { console.error(e); }
};

// Alternar Status
window.toggleTaskStatus = async (id, isCompleted) => {
    try { await updateDoc(doc(db, "tarefas", id), { completed: isCompleted }); } catch (e) { console.error(e); }
};

// === INTERFACE E INPUT ===

// Entrada da IA (Natural Language)
btnSendAi.addEventListener('click', handleAiInput);
aiInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAiInput();
});

function handleAiInput() {
    const text = aiInput.value.trim();
    if (!text) return;

    // Mostra indicador visual animando ícone
    const icon = document.querySelector('.ai-icon');
    icon.classList.remove('ph-sparkle');
    icon.classList.add('ph-spinner-gap', 'spin');

    setTimeout(() => { // Simula processamento
        const parsedTask = parseTaskFromText(text);
        saveTaskToDB(parsedTask);

        aiInput.value = '';
        icon.classList.remove('ph-spinner-gap', 'spin');
        icon.classList.add('ph-sparkle');
    }, 400);
}

// Mostrar/Esconder Form Manual
btnToggleManual.addEventListener('click', () => {
    manualForm.classList.toggle('hidden');
    if (!manualForm.classList.contains('hidden')) {
        btnToggleManual.textContent = "Cancele ou minimize aqui";
        document.getElementById('man-date').valueAsDate = new Date();
        document.getElementById('man-time').value = "12:00";
    } else {
        btnToggleManual.textContent = "...ou preencher manualmente";
    }
});

// Entrada Manual
manualForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('man-title').value;
    const date = document.getElementById('man-date').value;
    const time = document.getElementById('man-time').value;

    saveTaskToDB({ title, date, time });

    document.getElementById('man-title').value = '';
    manualForm.classList.add('hidden');
    btnToggleManual.textContent = "...ou preencher manualmente";
});

// Toast Feedback Helper
function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

// === NOTIFICAÇÕES PUSH SIMPLES ===
let notifInterval;

btnPermNotif.addEventListener('click', async () => {
    if (!("Notification" in window)) {
        alert("Este navegador não suporta notificações de sistema");
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        showToast("Notificações ativadas! 🔔");
        startNotificationLoop();
    }
});

function startNotificationLoop() {
    if (notifInterval) clearInterval(notifInterval);

    // A cada minuto checar se há alguma tarefa na hora exata
    notifInterval = setInterval(() => {
        const agora = new Date();
        const horaMinutoAtual = `${agora.getHours().toString().padStart(2, '0')}:${agora.getMinutes().toString().padStart(2, '0')}`;
        const dataAtual = `${agora.getFullYear()}-${(agora.getMonth() + 1).toString().padStart(2, '0')}-${agora.getDate().toString().padStart(2, '0')}`;

        // Pega as tarefas não concluídas pela UI para economizar reads do Firebase
        document.querySelectorAll('.task-card:not(.completed)').forEach(card => {
            const timeTag = card.querySelector('.task-meta span:nth-child(2)'); // Onde fica a hora
            const dateTag = card.querySelector('.task-meta span:nth-child(1)');

            if (timeTag) {
                const taskTime = timeTag.textContent.trim();
                const isToday = dateTag.textContent.includes('Hoje'); // Simplificado para este MVP

                if (isToday && taskTime === horaMinutoAtual) {
                    const title = card.querySelector('.task-title').textContent;
                    new Notification("AppAlerta: Hora da Tarefa!", {
                        body: title,
                        icon: "https://cdn-icons-png.flaticon.com/512/3239/3239999.png" // Icone base
                    });
                }
            }
        });

    }, 60000); // 1 minuto
}

// Inicia loop silenciosamente se já tem permissão
if ("Notification" in window && Notification.permission === "granted") {
    startNotificationLoop();
}
