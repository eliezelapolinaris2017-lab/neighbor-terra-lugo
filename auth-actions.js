import { firebaseConfig } from './firebase-config.js';

const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const forgotButton = document.querySelector('#forgotPassword');

forgotButton?.addEventListener('click', async () => {
  const email = String(loginForm?.elements?.email?.value || '').trim().toLowerCase();
  if (!email) {
    loginMessage.textContent = 'Escribe tu correo primero.';
    loginForm?.elements?.email?.focus();
    return;
  }

  forgotButton.disabled = true;
  loginMessage.textContent = 'Enviando enlace…';

  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);
    await authModule.sendPasswordResetEmail(auth, email);
    loginMessage.textContent = 'Revisa tu correo para crear o cambiar la contraseña.';
  } catch (error) {
    console.error(error);
    loginMessage.textContent = error?.code?.includes('invalid-email')
      ? 'El correo no es válido.'
      : 'No se pudo enviar el enlace. Verifica que el usuario exista en Firebase Authentication.';
  } finally {
    forgotButton.disabled = false;
  }
});
