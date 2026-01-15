async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function performLogin() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const birthdayInput = document.getElementById('auth-birthday').value;
    
    if (username.length < 2) return alert("Никнейм слишком короткий");
    if (password.length < 4) return alert("Пароль слишком короткий (мин. 4 символа)");

    const hashedPassword = await hashPassword(password);
    
    let age = 10;
    if (birthdayInput) {
        const birthDate = new Date(birthdayInput);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    }

    const userRef = window.db.ref('users/' + username);
    const snap = await userRef.once('value');

    if (!snap.exists()) {
        await userRef.set({
            username: username,
            password: hashedPassword, 
            age: age,
            registrationDate: Date.now(),
            description: "New user"
        });
        alert("Регистрация успешна!");
    } else {
        const userData = snap.val();
        
        if (userData.password !== hashedPassword) {
            return alert("Неверный пароль! Это имя пользователя уже занято.");
        }
        await userRef.update({ age: age });
    }
    document.cookie = `username=${encodeURIComponent(username)}; path=/; max-age=31536000`;
    document.cookie = `userage=${age}; path=/; max-age=31536000`;
    
    location.reload();
}
async function changeUserPassword() {
    const oldPass = document.getElementById('old-password').value;
    const newPass = document.getElementById('new-password').value;
    const username = getUsername();

    if (username === "Guest") return alert("Войдите в аккаунт");
    if (newPass.length < 4) return alert("Новый пароль слишком короткий");

    const oldHashed = await hashPassword(oldPass);
    const newHashed = await hashPassword(newPass);

    try {
        const userRef = window.db.ref('users/' + username);
        const snap = await userRef.once('value');

        if (snap.exists()) {
            const userData = snap.val();
            if (userData.password !== oldHashed) {
                return alert("Старый пароль введен неверно!");
            }

            await userRef.update({
                password: newHashed
            });

            alert("Пароль успешно изменен!");
            document.getElementById('old-password').value = "";
            document.getElementById('new-password').value = "";
        }
    } catch (e) {
        console.error(e);
        alert("Ошибка при смене пароля");
    }
}
function getUserAge() {
    const match = document.cookie.match(new RegExp('(^| )userage=([^;]+)'));
    console.log(match ? parseInt(match[2]) : 10);
    return match ? parseInt(match[2]) : 10;
}
function setCookie(name, value, days = 7) {
    var d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + "=" + encodeURIComponent(value) + ";expires=" + d.toUTCString() + ";path=/";
}

function getCookie(name) {
    var b = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return b ? decodeURIComponent(b.pop()) : undefined;
}

function getUsername() {
    return getCookie("username") || "Guest";
}

function logout() {
    setCookie("username", "", -1);
    location.reload();
}