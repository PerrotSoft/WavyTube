const dbConfigs = [{
        name: "Main",
        apiKey: "AIzaSyAXXLxdeKVvtchIXKZ6hihyFfXODrPV5m0",
        authDomain: "wavytube-3759e.firebaseapp.com",
        databaseURL: "https://wavytube-3759e-default-rtdb.firebaseio.com",
        projectId: "wavytube-3759e"
    },
    {
        apiKey: "AIzaSyB9nWpITMcd3Un8uuq221gCHDlAdgVJCAQ",
        authDomain: "wavytube1.firebaseapp.com",
        databaseURL: "https://wavytube1-default-rtdb.firebaseio.com",
        projectId: "wavytube1",
        storageBucket: "wavytube1.firebasestorage.app",
        messagingSenderId: "253554367570",
        appId: "1:253554367570:web:fd4842a810c8316391538b",
        measurementId: "G-N72KEK7Q1P"
    },
    {
        apiKey: "AIzaSyAqenNcLYtYLFB2TCLzo7XAnx5xZjPs158",
        authDomain: "wavytube2.firebaseapp.com",
        projectId: "wavytube2",
        storageBucket: "wavytube2.firebasestorage.app",
        messagingSenderId: "489277120914",
        appId: "1:489277120914:web:29702632c9384f63dbe14b",
        measurementId: "G-BBEYF6YG9P"
    }
];

let dbs = [];
let currentDbIndex = 0;

dbConfigs.forEach((conf, index) => {
    try {
        let app;
        const existingApp = firebase.apps.find(a => a.name === conf.name || (index === 0 && a.name === "[DEFAULT]"));

        if (!existingApp) {
            app = (index === 0) ?
                firebase.initializeApp(conf) :
                firebase.initializeApp(conf, conf.name);
        } else {
            app = existingApp;
        }
        dbs.push(app.database());
    } catch (e) {
        console.error("Ошибка инициализации базы " + conf.name, e);
    }
});

window.dbs = dbs;
window.db = dbs[currentDbIndex];

console.log("Система Multi-DB готова. Подключено баз: " + dbs.length);

async function rotateDatabaseIfNeeded() {
    if (!window.db) return;
    try {
        const snap = await window.db.ref('videos').once('value');
        let currentSize = 0;
        if (snap.exists()) {
            currentSize = JSON.stringify(snap.val()).length;
        }
        const LIMIT = 900 * 1024 * 1024;
        if (currentSize > LIMIT && currentDbIndex < dbs.length - 1) {
            currentDbIndex++;
            window.db = dbs[currentDbIndex];
            console.log("Текущая база заполнена. Переключено на базу №" + (currentDbIndex + 1));
        }
    } catch (e) {
        console.error("Ошибка при проверке лимита базы:", e);
    }
}

setInterval(rotateDatabaseIfNeeded, 60000);

function cleanPath(path) {
    return (path || '').replace(/^\/|\/$/g, '');
}

window.dbManager = {
    create: async(basePath, keyName, value) => {
        const path = cleanPath(basePath) + '/' + cleanPath(keyName);
        await window.db.ref(path).set(value);
    },
    editValue: async(fullPath, updates) => {
        await window.db.ref(cleanPath(fullPath)).update(updates);
    },
    get: async(fullPath) => {
        const path = cleanPath(fullPath);
        const snapshot = await window.db.ref(path).once('value');
        return snapshot.exists() ? { value: snapshot.val() } : null;
    },
    delete: async(fullPath) => {
        await window.db.ref(cleanPath(fullPath)).remove();
    }
};