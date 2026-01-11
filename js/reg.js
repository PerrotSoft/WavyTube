async function performLogin() {
    const name = document.getElementById('auth-username').value.trim();
    if (name.length < 2 || name.toLowerCase() === "guest") return alert("Invalid name");
    const pass = prompt("Enter password (minimum 4 characters):");
    if (!pass || pass.length < 4) return alert("Password too short");
    const userRef = window.db.ref('users/' + name);
    const snap = await userRef.once('value');
    if (snap.exists()) {
        const userData = snap.val();
        if (userData.password === pass) {
            setCookie("username", name);
            location.reload();
        } else {
            alert("Wrong password!");
        }
    } else {
        await userRef.set({
            password: pass,
            description: "New WavyTube user",
            subscribers: {},
            registeredAt: Date.now()
        });
        setCookie("username", name);
        alert("Account created!");
        location.reload();
    }
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