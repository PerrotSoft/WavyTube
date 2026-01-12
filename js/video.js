var currentPlayingId = null;
var selectedVideo = null;
var selectedThumbnail = null;
var CHUNK_SIZE = 512 * 1024;
var cachedUsers = {};
var hiddenVideo = document.createElement('video');
var canvas, ctx, currentBuffer = [];
var isBuffering = false;

window.onload = function() {
    const user = getUsername();
    if (user !== "Guest") {
        const upBtn = document.getElementById('header-upload-btn');
        if (upBtn) upBtn.classList.remove('hidden');
    }

    const theme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', theme);

    const avatar = document.getElementById('user-avatar');
    if (avatar) {
        avatar.innerText = user.charAt(0).toUpperCase();
        avatar.style.background = `hsl(${user.length * 40}, 70%, 50%)`;
    }

    setupCanvasPlayer();
    loadAllVideos().then(() => {
        handleUrlParams();
    });
};

window.onhashchange = handleUrlParams;

function setupCanvasPlayer() {
    canvas = document.getElementById('player-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    function render() {
        const needsBuffer = hiddenVideo.readyState < 3 || isBuffering || (hiddenVideo.currentTime > 0 && !hiddenVideo.paused && hiddenVideo.seeking);

        if (needsBuffer && !hiddenVideo.ended) {
            ctx.fillStyle = "#2a2a2a";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#ffffff";
            ctx.font = "20px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Loading data...", canvas.width / 2, canvas.height / 2);
        } else {
            try {
                ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
            } catch (e) {}
        }
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    hiddenVideo.ontimeupdate = () => {
        const p = (hiddenVideo.currentTime / hiddenVideo.duration) * 100 || 0;
        const bar = document.getElementById('progress-play');
        if (bar) bar.style.width = p + '%';
        const ts = document.getElementById('timestamp');
        if (ts) ts.innerText = formatTime(hiddenVideo.currentTime) + " / " + formatTime(hiddenVideo.duration);
    };

    const progContainer = document.getElementById('progress-container');
    if (progContainer) {
        progContainer.onclick = (e) => {
            const rect = progContainer.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            hiddenVideo.currentTime = clickPos * hiddenVideo.duration;
        };
    }

    const overlay = document.getElementById('player-overlay');
    if (overlay) {
        let lastClick = 0;
        overlay.onclick = (e) => {
            const now = Date.now();
            if (now - lastClick < 300) {
                const rect = overlay.getBoundingClientRect();
                const isRight = (e.clientX - rect.left > rect.width / 2);
                hiddenVideo.currentTime += isRight ? 10 : -10;
                showRipple(e.clientX, e.clientY);
            } else {
                togglePlay();
            }
            lastClick = now;
        };
    }
}

async function handleUrlParams() {
    const hash = window.location.hash;
    if (hash.indexOf('#-=') === 0) {
        const vidId = hash.substring(3);
        const snap = await window.db.ref('videos/' + vidId).once('value');
        if (snap.exists()) openVideoView(snap.val(), vidId);
    } else if (hash.indexOf('#!') === 0) {
        openChannel(decodeURIComponent(hash.substring(2)));
    } else {
        document.body.classList.remove('video-active');
        document.getElementById('video-view-section').classList.add('hidden');
        hiddenVideo.pause();
    }
}

function handleProfileClick() {
    const user = getUsername();
    if (user === "Guest") {
        document.getElementById('modal-auth').classList.remove('hidden');
    } else {
        openChannel(user);
    }
}

function logout() {
    document.cookie = "username=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    location.reload();
}

function handleVideoSearch() {
    const q = document.getElementById('video-search').value.toLowerCase();
    if (q.indexOf('!') === 0) {
        const channel = q.substring(1);
        if (channel.length > 1) openChannel(channel);
        return;
    }
    document.querySelectorAll('.video-card').forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(q) ? 'flex' : 'none';
    });
}
async function postComment() {
    const me = getUsername();
    const text = document.getElementById('comment-text').value.trim();

    if (me === "Guest") return alert("Please log in to comment");
    if (!text || !currentPlayingId) return;

    const newComment = {
        author: me,
        text: text,
        timestamp: Date.now()
    };

    await window.db.ref(`video_comments/${currentPlayingId}`).push(newComment);

    document.getElementById('comment-text').value = "";
    loadComments(currentPlayingId);
}

async function loadComments(videoId) {
    const listEl = document.getElementById('comments-list');
    if (!listEl) return;

    listEl.innerHTML = "Loading comments...";

    const snap = await window.db.ref(`video_comments/${videoId}`).once('value');
    listEl.innerHTML = "";

    if (snap.exists()) {
        const comments = snap.val();
        Object.values(comments).reverse().forEach(c => {
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.innerHTML = `
                <div class="comment-author"><b>${c.author}</b> <small>${new Date(c.timestamp).toLocaleDateString()}</small></div>
                <div class="comment-text">${c.text}</div>
            `;
            listEl.appendChild(div);
        });
    } else {
        listEl.innerHTML = "<p style='color: #aaa;'>No comments yet. Be the first!</p>";
    }
}
async function loadAllVideos() {
    const container = document.getElementById("video-feed");
    if (!container) return;

    const vRes = await window.db.ref('videos').once('value');
    const uSnap = await window.db.ref('users').once('value');
    if (!vRes.exists()) return;

    const vData = vRes.val();
    const allUsers = uSnap.val() || {};
    const currentUser = getUsername();

    RecommendationSystem.setVideoList(vData, allUsers, currentUser);
    const sortedIds = RecommendationSystem.getSortedIds();

    container.innerHTML = "";
    sortedIds.forEach(id => {
        const data = vData[id];
        const card = document.createElement("div");
        card.className = "video-card";
        card.onclick = () => window.location.hash = '-=' + id;

        const uInfo = allUsers[data.author] || {};
        const avatarBg = uInfo.avatar ?
            `background-image:url(${uInfo.avatar}); background-size:cover; background-position:center;` :
            `background-color: hsl(${data.author.length * 40}, 70%, 50%);`;

        card.innerHTML = `
            <div class="thumbnail-wrapper">
                <img src="${data.thumbnail || ''}" loading="lazy">
            </div>
            <div class="video-info">
                <div class="author-avatar-mini" style="${avatarBg}" onclick="event.stopPropagation(); openChannel('${data.author}')">
                    ${uInfo.avatar ? '' : data.author.charAt(0).toUpperCase()}
                </div>
                <div class="video-text">
                    <b class="v-title">${data.title}</b>
                    <small class="v-author">${data.author}</small>
                    <small class="v-meta">${data.views || 0} views</small>
                </div>
            </div>`;
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

    let tV = 0,
        vC = 0;
    const vRes = await window.db.ref('videos').once('value');

    if (vRes.exists()) {
        Object.entries(vRes.val()).reverse().forEach(([id, data]) => {
            if (data.author === targetUser) {
                vC++;
                tV += (data.views || 0);
                const div = document.createElement("div");
                div.className = "channel-video-card";

                div.onclick = () => {
                    document.getElementById('channel-modal').classList.add('hidden');
                    window.location.hash = '-=' + id;
                };

                let delBtnHtml = isOwner ? `
            <div class="card-footer">
                <button class="delete-btn-simple" onclick="event.stopPropagation(); deleteVid('${id}', '${data.fileId}')">Удалить</button>
            </div>` : "";

                div.innerHTML = `
            <div class="card-main-content">
                <img src="${data.thumbnail}">
                <div class="video-info">
                    <div class="video-text">
                        <b>${data.title}</b>
                        <small>${data.views || 0} views</small>
                    </div>
                </div>
            </div>
            ${delBtnHtml}`;
                list.appendChild(div);
            }
        });
    }

    const subCount = userData.subscribers ? Object.keys(userData.subscribers).length : 0;
    document.getElementById('ch-name').innerText = targetUser;
    document.getElementById('ch-subs-count').innerText = `${subCount} subs • ${vC} videos • ${tV} views`;
    document.getElementById('ch-desc-text').innerText = userData.description || "No description.";

    const avatarLetter = document.getElementById('ch-avatar-letter');
    if (userData.avatar) {
        avatarLetter.style.backgroundImage = `url(${userData.avatar})`;
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
        subBtn.className = "primary-btn";
        const isSubbed = userData.subscribers && userData.subscribers[me];
        subBtn.innerText = isSubbed ? "Subscribed" : "Subscribe";
        subBtn.onclick = () => toggleSub(targetUser);
        actionsDiv.appendChild(subBtn);
    }
}

async function toggleSub(targetUser) {
    const me = getUsername();
    if (me === "Guest") return alert("Please log in");
    const ref = window.db.ref(`users/${targetUser}/subscribers/${me}`);
    const snap = await ref.once('value');
    if (snap.exists()) await ref.remove();
    else await ref.set(true);
    openChannel(targetUser);
}

async function deleteVid(id, fileId) {
    if (confirm('Delete this video?')) {
        await window.db.ref('videos/' + id).remove();
        await window.db.ref('file_chunks/' + fileId).remove();
        location.reload();
    }
}

async function openSettings() {
    const me = getUsername();
    const snap = await window.db.ref('users/' + me).once('value');
    const userData = snap.val() || {};
    document.getElementById('set-new-name').value = me;
    document.getElementById('set-desc').value = userData.description || "";
    document.getElementById('modal-settings').classList.remove('hidden');
}

async function saveChannelSettings() {
    const oldName = getUsername();
    const newName = document.getElementById('set-new-name').value.trim();
    const newDesc = document.getElementById('set-desc').value.trim();
    const avatarFile = document.getElementById('set-avatar-file').files[0];

    if (newName.length < 2) return;
    const updates = { description: newDesc };
    if (avatarFile) updates.avatar = await resizeImage(avatarFile, 200);

    if (newName !== oldName) {
        const check = await window.db.ref('users/' + newName).once('value');
        if (check.exists()) return alert("Username taken");

        const oldDataSnap = await window.db.ref('users/' + oldName).once('value');
        const finalData = Object.assign({}, oldDataSnap.val(), updates);

        await window.db.ref('users/' + newName).set(finalData);
        const vSnap = await window.db.ref('videos').once('value');
        if (vSnap.exists()) {
            const vData = vSnap.val();
            for (let vidId in vData) {
                if (vData[vidId].author === oldName) {
                    await window.db.ref(`videos/${vidId}/author`).set(newName);
                }
            }
        }
        await window.db.ref('users/' + oldName).remove();
        document.cookie = `username=${encodeURIComponent(newName)}; path=/;`;
    } else {
        await window.db.ref('users/' + oldName).update(updates);
    }
    location.reload();
}

async function openVideoView(data, id) {
    currentPlayingId = id;
    currentBuffer = new Array(data.totalChunks).fill(null);
    isBuffering = true;

    document.body.classList.add('video-active');
    document.getElementById('video-view-section').classList.remove('hidden');

    const titleEl = document.getElementById('view-title');
    const authorEl = document.getElementById('view-author');
    const avDiv = document.getElementById('view-author-avatar');

    titleEl.innerText = data.title;
    authorEl.innerText = data.author;
    document.getElementById('back-btn').classList.remove('hidden');

    const goToChannel = () => openChannel(data.author);
    authorEl.onclick = goToChannel;
    if (avDiv) avDiv.onclick = goToChannel;
    loadComments(id);
    if (avDiv) {
        avDiv.style.backgroundImage = 'none';
        avDiv.innerText = '';
        window.db.ref('users/' + data.author).once('value').then(snap => {
            const uData = snap.val();
            if (uData && uData.avatar) {
                avDiv.style.backgroundImage = `url(${uData.avatar})`;
                avDiv.innerText = "";
            } else {
                avDiv.innerText = data.author.charAt(0).toUpperCase();
                avDiv.style.backgroundColor = `hsl(${data.author.length * 40}, 70%, 50%)`;
            }
        });
    }

    const likesCount = data.likes ? Object.keys(data.likes).length : 0;
    document.getElementById('view-likes').innerText = likesCount;

    window.db.ref('videos/' + id + '/views').transaction(c => (c || 0) + 1);

    const firstChunk = await window.db.ref(`file_chunks/${data.fileId}/chunk_0`).once('value');
    if (firstChunk.exists()) {
        currentBuffer[0] = base64ToArrayBuffer(firstChunk.val());
        refreshSource();
    }
    for (let i = 1; i < data.totalChunks; i++) {
        window.db.ref(`file_chunks/${data.fileId}/chunk_${i}`).once('value').then(snap => {
            if (snap.exists()) {
                currentBuffer[i] = base64ToArrayBuffer(snap.val());
                const loaded = currentBuffer.filter(Boolean).length;
                const loadBar = document.getElementById('progress-load');
                if (loadBar) loadBar.style.width = (loaded / data.totalChunks * 100) + '%';

                if (loaded % 5 === 0 || loaded === data.totalChunks) refreshSource(true);
            }
        });
    }
}

function toggleCommentsMobile() {
    if (window.innerWidth <= 768) {
        const root = document.getElementById('comments-root');
        root.classList.toggle('expanded');
    }
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
        btn.innerText = newTheme === 'dark' ? '🌙' : '☀️';
    }
}

function refreshSource(keepPos = false) {
    const pos = hiddenVideo.currentTime;
    const isPaused = hiddenVideo.paused;
    const blob = new Blob(currentBuffer.filter(Boolean), { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    hiddenVideo.src = url;
    if (keepPos) {
        hiddenVideo.onloadedmetadata = () => {
            hiddenVideo.currentTime = pos;
            if (!isPaused) hiddenVideo.play().catch(() => {});
            isBuffering = false;
        };
    } else {
        hiddenVideo.play().catch(() => {});
        isBuffering = false;
    }
}

async function handleLike() {
    const me = getUsername();
    if (me === "Guest" || !currentPlayingId) return;
    const ref = window.db.ref(`videos/${currentPlayingId}/likes/${me}`);
    const snap = await ref.once('value');
    if (snap.exists()) await ref.remove();
    else await ref.set(true);

    const newSnap = await window.db.ref(`videos/${currentPlayingId}/likes`).once('value');
    document.getElementById('view-likes').innerText = newSnap.exists() ? Object.keys(newSnap.val()).length : 0;
}

async function startVideoUpload() {
    const title = document.getElementById('v-title').value.trim();
    const btn = document.getElementById('upload-btn');
    if (!title || !selectedVideo) return alert("Select file and title");

    btn.disabled = true;
    const fileId = "vid_" + Date.now();
    const arrayBuffer = await selectedVideo.arrayBuffer();
    const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

    const customThumbFile = document.getElementById('v-custom-thumb').files[0];
    const finalThumbnail = customThumbFile ? await resizeImage(customThumbFile, 320) : selectedThumbnail;

    for (let i = 0; i < totalChunks; i++) {
        const chunk = arrayBuffer.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const b64 = btoa(new Uint8Array(chunk).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        await window.db.ref(`file_chunks/${fileId}/chunk_${i}`).set(b64);
        btn.innerText = `Uploading: ${Math.round((i/totalChunks)*100)}%`;
    }

    await window.db.ref('videos').push({
        title,
        author: getUsername(),
        fileId,
        totalChunks,
        thumbnail: finalThumbnail || "",
        timestamp: Date.now(),
        views: 0
    });
    location.reload();
}

function handleVideoSelect(input) {
    if (input.files && input.files[0]) {
        selectedVideo = input.files[0];
        document.getElementById('upload-btn').classList.remove('hidden');

        const v = document.createElement('video');
        v.src = URL.createObjectURL(selectedVideo);
        v.muted = true;
        v.play();

        v.onloadeddata = () => {
            setTimeout(() => {
                const c = document.createElement('canvas');
                c.width = 640;
                c.height = 360;
                c.getContext('2d').drawImage(v, 0, 0, 640, 360);
                selectedThumbnail = c.toDataURL('image/jpeg', 0.8);
                document.getElementById('preview-img').src = selectedThumbnail;
                document.getElementById('preview-container').classList.remove('hidden');
                v.pause();
                URL.revokeObjectURL(v.src);
            }, 1000);
        };
    }
}

function setPlaybackSpeed(val) {
    hiddenVideo.playbackRate = parseFloat(val);
}

function toggleFullscreen() {
    const container = document.getElementById('player-container');
    if (!document.fullscreenElement) {
        if (container.requestFullscreen) container.requestFullscreen();
        else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function togglePlay() {
    if (hiddenVideo.paused) hiddenVideo.play().catch(() => {});
    else hiddenVideo.pause();
    const btn = document.getElementById('play-pause-btn');
    if (btn) btn.innerText = hiddenVideo.paused ? "▶" : "⏸";
}

function toggleMute() {
    hiddenVideo.muted = !hiddenVideo.muted;
    const btn = document.getElementById('mute-btn');
    if (btn) btn.innerText = hiddenVideo.muted ? "🔇" : "🔊";
}

function closeVideoView() {
    window.location.hash = "";
    document.body.classList.remove('video-active');
    document.getElementById('video-view-section').classList.add('hidden');
    hiddenVideo.pause();
    hiddenVideo.src = "";
}

function openUploadModal() {
    document.getElementById('modal-upload').classList.remove('hidden');
}

function closeModal(id) {
    if (id === 'channel-modal') window.location.hash = "";
    document.getElementById(id).classList.add('hidden');
}

function formatTime(s) {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s / 60),
        sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" + sec : sec);
}

function base64ToArrayBuffer(b64) {
    const bin = atob(b64.split(',')[1] || b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
}

function getUsername() {
    const match = document.cookie.match(new RegExp('(^| )username=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : "Guest";
}

function resizeImage(file, size) {
    return new Promise(r => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                const h = img.height * (size / img.width);
                c.width = size;
                c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, size, h);
                r(c.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function showRipple(x, y) {
    const r = document.createElement('div');
    r.className = 'ripple-effect';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 400);
}