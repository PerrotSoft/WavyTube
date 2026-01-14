async function performLogin() {
    const username = document.getElementById('auth-username').value.trim();
    const birthdayInput = document.getElementById('auth-birthday').value;
    
    if (username.length < 2) return alert("Nickname too short");

    let age = 10;
    if (birthdayInput) {
        const birthDate = new Date(birthdayInput);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
    }

    const userRef = window.db.ref('users/' + username);
    const snap = await userRef.once('value');

    if (!snap.exists()) {
        await userRef.set({
            username: username,
            age: age,
            registrationDate: Date.now(),
            description: "New user"
        });
    } else {
        await userRef.update({ age: age });
    }

    document.cookie = `username=${encodeURIComponent(username)}; path=/; max-age=31536000`;
    document.cookie = `userage=${age}; path=/; max-age=31536000`;
    
    location.reload();
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