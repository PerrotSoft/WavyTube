// 1. Конфигурации ваших баз данных
const dbConfigs = [{
        name: "Main", // Первая база (была заблокирована)
        apiKey: "AIzaSyAXXLxdeKVvtchIXKZ6hihyFfXODrPV5m0",
        authDomain: "wavytube-3759e.firebaseapp.com",
        databaseURL: "https://wavytube-3759e-default-rtdb.firebaseio.com",
        projectId: "wavytube-3759e"
    },
    {
        name: "Secondary", // Вторая база
        apiKey: "AIzaSyB9nWpITMcd3Un8uuq221gCHDlAdgVJCAQ",
        authDomain: "wavytube1.firebaseapp.com",
        databaseURL: "https://wavytube1-default-rtdb.firebaseio.com",
        projectId: "wavytube1"
    }
];

// Массивы для хранения инициализированных баз
let dbs = [];
let currentDbIndex = 0;

// 2. Безопасная инициализация
dbConfigs.forEach((conf, index) => {
    try {
        let app;
        // Проверяем, не инициализировано ли уже приложение
        const existingApp = firebase.apps.find(a => a.name === conf.name || (index === 0 && a.name === "[DEFAULT]"));

        if (!existingApp) {
            // Первую базу делаем основной ([DEFAULT]), остальные - именованными
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

// Глобальные переменные для доступа из других файлов
window.dbs = dbs;
window.db = dbs[currentDbIndex]; // Изначально работаем с первой доступной

console.log("Система Multi-DB готова. Подключено баз: " + dbs.length);

// 3. Логика автоматического переключения при заполнении
async function rotateDatabaseIfNeeded() {
    if (!window.db) return;

    try {
        // Проверяем размер текущей базы (приблизительно через ветку видео)
        const snap = await window.db.ref('videos').once('value');
        let currentSize = 0;
        if (snap.exists()) {
            currentSize = JSON.stringify(snap.val()).length;
        }

        // Если база заполнена (лимит 900МБ для безопасности)
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

// Проверка каждые 60 секунд
setInterval(rotateDatabaseIfNeeded, 60000);

// 4. Вспомогательные функции для работы с данными
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