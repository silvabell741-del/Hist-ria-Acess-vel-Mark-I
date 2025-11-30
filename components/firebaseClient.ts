import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBngjjfMrWg7O9TABuQNI0rlq-ktce9U30",
  authDomain: "historiaacessivel-ii.firebaseapp.com",
  projectId: "historiaacessivel-ii",
  storageBucket: "historiaacessivel-ii.firebasestorage.app",
  messagingSenderId: "652479717072",
  appId: "1:652479717072:web:49b1824c113c67faed08d5"
};

// Inicializa o Firebase
// Exportamos 'app' para ser usado por módulos lazy (ex: firebaseStorage.ts)
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Habilita persistência offline (IndexedDB)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        // Múltiplas abas abertas
        console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        // Navegador não suportado
        console.warn('Persistence failed: Browser not supported');
    }
});
