var currentPlayingId = null;
var selectedVideo = null;
var selectedThumbnail = null;
var CHUNK_SIZE = 512 * 1024;
var cachedUsers = {};

window.onload = function() {
    var user = getUsername();
    if (user !== "Guest") document.getElementById('header-upload-btn').classList.remove('hidden');
    var theme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', theme);
    loadAllVideos().then(function() {
        handleUrlParams();
    });
};

window.onhashchange = handleUrlParams;

async function handleUrlParams() {
    var hash = window.location.hash;
    if (hash.indexOf('#-=') === 0) {
        var vidId = hash.substring(3);
        var snap = await window.db.ref('videos/' + vidId).once('value');
        if (snap.exists()) openVideoView(snap.val(), vidId);
    } else if (hash.indexOf('#!') === 0) {
        openChannel(decodeURIComponent(hash.substring(2)));
    }
}

function handleProfileClick() {
    var user = getUsername();
    if (user === "Guest") document.getElementById('modal-auth').classList.remove('hidden');
    else openChannel(user);
}

function logout() {
    document.cookie = "username=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    location.reload();
}

function handleVideoSearch() {
    var q = document.getElementById('video-search').value.toLowerCase();
    if (q.indexOf('!') === 0) {
        var channel = q.substring(1);
        if (channel.length > 1) openChannel(channel);
        return;
    }
    document.querySelectorAll('.video-card').forEach(function(c) {
        c.style.display = c.innerText.toLowerCase().indexOf(q) !== -1 ? 'flex' : 'none';
    });
}

function openCurrentAuthorChannel() {
    var author = document.getElementById('view-author').innerText;
    if (author) openChannel(author);
}

async function loadAllVideos() {
    var vRes = await window.db.ref('videos').once('value');
    var uSnap = await window.db.ref('users').once('value');
    if (!vRes.exists()) return;
    var vData = vRes.val();
    cachedUsers = uSnap.val() || {};
    var container = document.getElementById("video-feed");
    container.innerHTML = "";
    Object.keys(vData).reverse().forEach(function(id) {
        var data = vData[id];
        var card = document.createElement("div");
        card.className = "video-card";
        card.onclick = function() {
            window.location.hash = '-=' + id;
            openVideoView(data, id);
        };
        var uInfo = cachedUsers[data.author] || {};
        var avatarStyle = uInfo.avatar ? 'style="background-image:url(' + uInfo.avatar + '); background-size:cover; background-position:center;"' : "";
        card.innerHTML = '<img src="' + (data.thumbnail || '') + '"><div class="video-info"><div class="author-avatar-mini" ' + avatarStyle + ' onclick="event.stopPropagation(); openChannel(\'' + data.author + '\')"></div><div class="video-text"><b>' + data.title + '</b><br><small>' + data.author + '</small><br><small>' + (data.views || 0) + ' views</small></div></div>';
        container.appendChild(card);
    });
}

async function openChannel(targetUser) {
    const me = getUsername();
    const isOwner = (me === targetUser);
    document.getElementById('channel-modal').classList.remove('hidden');

    const list = document.getElementById('ch-video-list');
    const actionsDiv = document.getElementById('ch-actions');
    list.innerHTML = "";
    actionsDiv.innerHTML = "";

    const userSnap = await window.db.ref('users/' + targetUser).once('value');
    const userData = userSnap.val() || {};

    let tV = 0, vC = 0;
    const vRes = await window.db.ref('videos').once('value');

    if (vRes.exists()) {
        Object.entries(vRes.val()).reverse().forEach(([id, data]) => {
            if (data.author === targetUser) {
                vC++;
                tV += (data.views || 0);
                const div = document.createElement("div");
                div.className = "video-card";
                let delBtn = isOwner ? `<button class="secondary-btn" onclick="event.stopPropagation(); deleteVid('${id}', '${data.fileId}')">Delete</button>` : "";
                div.onclick = function() {
                    document.getElementById('channel-modal').classList.add('hidden');
                    openVideoView(data, id);
                };
                div.innerHTML = `<img src="${data.thumbnail}"><div class="video-info"><div class="video-text"><b>${data.title}</b><small>${data.views || 0} views</small></div></div>${delBtn}`;
                list.appendChild(div);
            }
        });
    }

    const subCount = userData.subscribers ? Object.keys(userData.subscribers).length : 0;
    document.getElementById('ch-name').innerText = targetUser;
    document.getElementById('ch-subs-count').innerHTML = `${subCount} subs • ${vC} videos • ${tV} views`;
    document.getElementById('ch-desc-text').innerText = userData.description || "";
    
    var avatarLetter = document.getElementById('ch-avatar-letter');
    if (userData.avatar) {
        avatarLetter.style.backgroundImage = `url(${userData.avatar})`;
        avatarLetter.style.backgroundSize = "cover";
        avatarLetter.style.backgroundPosition = "center";
        avatarLetter.innerText = "";
    } else {
        avatarLetter.style.backgroundImage = "none";
        avatarLetter.innerText = targetUser.charAt(0).toUpperCase();
    }

    if (isOwner) {
        actionsDiv.innerHTML = `
            <button class="secondary-btn" onclick="openSettings()">⚙️ Settings</button>
            <button class="secondary-btn" onclick="logout()">Logout</button>
        `;
    } else {
        const subBtn = document.createElement('button');
        subBtn.id = "ch-modal-sub-btn";
        subBtn.className = "primary-btn";
        const isSubbed = userData.subscribers && userData.subscribers[me];
        subBtn.innerText = isSubbed ? "Вы подписаны" : "Подписаться";
        subBtn.onclick = function() { toggleSub(targetUser); };
        actionsDiv.appendChild(subBtn);
    }
}

function updateSubButton(targetUser, userData) {
    var me = getUsername();
    var actionsDiv = document.getElementById('ch-actions');
    var viewSubBtn = document.getElementById('view-sub-btn');
    var isSubbed = userData.subscribers && userData.subscribers[me];
    var btnHtml = (me !== "Guest" && me !== targetUser) ? '<button class="sub-btn" onclick="toggleSub(\'' + targetUser + '\')">' + (isSubbed ? 'Subscribed' : 'Subscribe') + '</button>' : (me === targetUser ? '<button class="secondary-btn" onclick="openSettings()">⚙️</button>' : '');
    if (actionsDiv) actionsDiv.innerHTML = btnHtml;
    if (viewSubBtn) {
        viewSubBtn.innerText = isSubbed ? 'Subscribed' : 'Subscribe';
        viewSubBtn.onclick = function() { toggleSub(targetUser); };
    }
}

async function toggleSub(targetUser) {
    var me = getUsername();
    if (me === "Guest") return alert("Log in");
    var ref = window.db.ref('users/' + targetUser + '/subscribers/' + me);
    var snap = await ref.once('value');
    if (snap.exists()) await ref.remove();
    else await ref.set(true);
    var newUserSnap = await window.db.ref('users/' + targetUser).once('value');
    updateSubButton(targetUser, newUserSnap.val() || {});
    if (!document.getElementById('channel-modal').classList.contains('hidden')) openChannel(targetUser);
}

async function openSettings() {
    var me = getUsername();
    if (me === "Guest") return;
    var userData = cachedUsers[me];
    if (!userData) {
        var snap = await window.db.ref('users/' + me).once('value');
        userData = snap.val() || {};
        cachedUsers[me] = userData;
    }
    document.getElementById('set-new-name').value = me;
    document.getElementById('set-desc').value = userData.description || "";
    document.getElementById('modal-settings').classList.remove('hidden');
}

async function saveChannelSettings() {
    var oldName = getUsername(),
        newName = document.getElementById('set-new-name').value.trim(),
        newDesc = document.getElementById('set-desc').value.trim(),
        avatarFile = document.getElementById('set-avatar-file').files[0];
    if (newName.length < 2) return;
    var updates = { description: newDesc };
    if (avatarFile) updates.avatar = await resizeImage(avatarFile, 200);
    if (newName !== oldName) {
        var check = await window.db.ref('users/' + newName).once('value');
        if (check.exists()) return alert("Taken");
        var oldDataSnap = await window.db.ref('users/' + oldName).once('value');
        var oldData = oldDataSnap.val() || {};
        var finalData = Object.assign({}, oldData, updates);
        await window.db.ref('users/' + newName).set(finalData);
        var vSnap = await window.db.ref('videos').once('value');
        if (vSnap.exists()) {
            var vData = vSnap.val();
            for (var vidId in vData) { if (vData[vidId].author === oldName) await window.db.ref('videos/' + vidId + '/author').set(newName); }
        }
        await window.db.ref('users/' + oldName).remove();
        setCookie("username", newName);
    } else { await window.db.ref('users/' + oldName).update(updates); }
    location.reload();
}

async function openVideoView(data, id) {
    currentPlayingId = id;
    document.body.classList.add('video-active');
    document.getElementById('video-view-section').classList.remove('hidden');
    document.getElementById('back-btn').classList.remove('hidden');
    document.getElementById('view-title').innerText = data.title;
    document.getElementById('view-author').innerText = data.author;
    var likesCount = data.likes ? Object.keys(data.likes).length : 0;
    document.getElementById('view-likes').innerText = likesCount;
    var uSnap = await window.db.ref('users/' + data.author).once('value');
    var uData = uSnap.val() || {};
    var avDiv = document.getElementById('view-author-avatar');
    if (avDiv) {
        avDiv.style.backgroundImage = uData.avatar ? 'url(' + uData.avatar + ')' : 'none';
        avDiv.style.backgroundSize = "cover";
        avDiv.style.backgroundPosition = "center";
    }
    updateSubButton(data.author, uData);
    window.db.ref('videos/' + id + '/views').transaction(function(c) { return (c || 0) + 1; });
    var player = document.getElementById('main-video-player');
    var fullB64 = "";
    for (var i = 0; i < data.totalChunks; i++) {
        var chunk = await window.db.ref('file_chunks/' + data.fileId + '/chunk_' + i).once('value');
        if (chunk.exists()) { fullB64 += chunk.val(); if (i === 0) playStream(fullB64, player); }
    }
    playStream(fullB64, player);
}

function playStream(b64, p) {
    try {
        var raw = b64.indexOf(",") !== -1 ? b64.split(",")[1] : b64;
        var bin = atob(raw), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var t = p.currentTime;
        p.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        p.currentTime = t;
    } catch (e) {}
}

async function handleLike() {
    var me = getUsername();
    if (me === "Guest" || !currentPlayingId) return;
    var ref = window.db.ref('videos/' + currentPlayingId + '/likes/' + me);
    var snap = await ref.once('value');
    if (snap.exists()) await ref.remove();
    else await ref.set(true);
    var newSnap = await window.db.ref('videos/' + currentPlayingId + '/likes').once('value');
    document.getElementById('view-likes').innerText = newSnap.exists() ? Object.keys(newSnap.val()).length : 0;
}

async function startVideoUpload() {
    var title = document.getElementById('v-title').value;
    var btn = document.getElementById('upload-btn');
    if (!title || !selectedVideo) return alert("Fill in the title and select a video");
    btn.disabled = true;
    var fId = "vid_" + Date.now();
    var customThumbFile = document.getElementById('v-custom-thumb').files[0];
    var finalThumbnail = customThumbFile ? await resizeImage(customThumbFile, 320) : selectedThumbnail;
    var b64 = selectedVideo.content.split(",")[1];
    var total = Math.ceil(b64.length / CHUNK_SIZE);
    for (var i = 0; i < total; i++) {
        btn.innerText = Math.round((i / total) * 100) + "%";
        await window.db.ref('file_chunks/' + fId + '/chunk_' + i).set(b64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await window.db.ref('videos').push({
        title: title,
        author: getUsername(),
        fileId: fId,
        totalChunks: total,
        thumbnail: finalThumbnail,
        views: 0,
        timestamp: Date.now()
    });
    location.reload();
}

function handleVideoSelect(input) {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function(e) {
        selectedVideo = { content: e.target.result };
        selectedThumbnail = await captureFrame(e.target.result);
        document.getElementById('preview-img').src = selectedThumbnail;
        document.getElementById('preview-container').classList.remove('hidden');
        document.getElementById('upload-btn').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function captureFrame(b) {
    return new Promise(function(r) {
        var v = document.createElement('video');
        v.src = b;
        v.onloadeddata = function() { v.currentTime = 1; };
        v.onseeked = function() {
            var c = document.createElement('canvas');
            c.width = 320;
            c.height = 180;
            c.getContext('2d').drawImage(v, 0, 0, 320, 180);
            r(c.toDataURL('image/jpeg', 0.6));
        };
    });
}

function resizeImage(file, size) {
    return new Promise(function(r) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var c = document.createElement('canvas'), ctx = c.getContext('2d');
                var w = size, h = img.height * (size / img.width);
                c.width = w; c.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                r(c.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function closeModal(id) {
    if (id === 'channel-modal') window.location.hash = "";
    document.getElementById(id).classList.add('hidden');
}

function closeVideoView() {
    window.location.hash = "";
    document.body.classList.remove('video-active');
    document.getElementById('video-view-section').classList.add('hidden');
    document.getElementById('main-video-player').pause();
}

function openUploadModal() { document.getElementById('modal-upload').classList.remove('hidden'); }

window.openEditVideo = async function(id) {
    var snap = await window.db.ref('videos/' + id).once('value'), data = snap.val();
    var newTitle = prompt("Title:", data.title), newDesc = prompt("Description:", data.description || "");
    if (newTitle !== null) {
        await window.db.ref('videos/' + id).update({ title: newTitle, description: newDesc });
        openChannel(data.author);
    }
};