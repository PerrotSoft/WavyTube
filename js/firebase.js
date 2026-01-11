const firebaseConfig = {
    apiKey: "AIzaSyBiSpaZSP26ho82OjaTglDl5SXItOZrNTg",
    authDomain: "wavytube-752a1.firebaseapp.com",
    projectId: "wavytube-752a1",
    storageBucket: "wavytube-752a1.firebasestorage.app",
    messagingSenderId: "84079190588",
    appId: "1:84079190588:web:e9c4d91dfcbb03504f9939",
    measurementId: "G-B772TKHCH9"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

window.db = db;

console.log("Firebase Realtime Database (RTDB) initialized.");

function cleanPath(path) {
    if (!path || path === '/') return '';
    return path.replace(/^\/|\/$/g, '');
}

function getFullPath(basePath, keyName) {
    const cleanBase = cleanPath(basePath);
    const cleanKey = cleanPath(keyName);
    if (cleanBase === '') return cleanKey;
    else if (cleanKey === '') return cleanBase;
    else return `${cleanBase}/${cleanKey}`;
}

async function createNewKey(basePath, keyName, value) {
    const fullPath = getFullPath(basePath, keyName);
    await db.ref(fullPath).set(value);
}

async function editKeyValue(fullPath, updates) {
    await db.ref(cleanPath(fullPath)).update(updates);
}

async function getKeyData(fullPath) {
    const cleanP = cleanPath(fullPath);
    const snapshot = await db.ref(cleanP).once('value');
    if (snapshot.exists()) {
        return { key: cleanP.split('/').pop(), path: cleanP, value: snapshot.val() };
    }
    return null;
}

async function deleteKey(fullPath) {
    await db.ref(cleanPath(fullPath)).remove();
}

window.dbManager = {
    create: createNewKey,
    editValue: editKeyValue,
    get: getKeyData,
    delete: deleteKey
};