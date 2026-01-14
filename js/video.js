var currentPlayingId = null;
var selectedVideo = null;
var selectedThumbnail = null;
var CHUNK_SIZE = 512 * 1024;
var cachedUsers = {};
var hiddenVideo = document.createElement('video');
var canvas, ctx, currentBuffer = [];
var isBuffering = false;

var lastAdTime = 0;
var isAdPlaying = false;
var currentBlobUrl = null;
var adTimerInterval;

const SVG_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg width='320' height='180' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='100%25' height='100%25' fill='%231a1a1a'/%3E%3Ctext x='50%25' y='50%25' fill='%23444' font-family='Arial' font-size='16' text-anchor='middle'%3ENo Preview%3C/text%3E%3C/svg%3E";

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
            ctx.fillText(isAdPlaying ? "Реклама..." : "Loading data...", canvas.width / 2, canvas.height / 2);
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

        if (!isAdPlaying && (hiddenVideo.currentTime - lastAdTime >= 240)) {
            playAd();
        }
    };

    const progContainer = document.getElementById('progress-container');
    if (progContainer) {
        progContainer.onclick = (e) => {
            if (isAdPlaying) return;
            const rect = progContainer.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            hiddenVideo.currentTime = clickPos * hiddenVideo.duration;
        };
    }

    const overlay = document.getElementById('player-overlay');
    if (overlay) {
        let lastClick = 0;
        overlay.onclick = (e) => {
            if (isAdPlaying) return;
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

    hiddenVideo.onended = () => {
        if (isAdPlaying) finishAd();
    };
}

function playAd() {
    isAdPlaying = true;
    hiddenVideo.pause();

    const FALLBACK_IMAGE = "https://via.placeholder.com/300x250/000000/FFFFFF/?text=Рекламная+Пауза";

    let overlay = document.getElementById('video-ad-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'video-ad-overlay';
        overlay.style = "position:absolute;top:0;left:0;width:100%;height:100%;background:#000;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;";
        overlay.innerHTML = `
            <div id="ad-slot-wrapper" style="width:300px;height:250px;position:relative;background:#111;">
                <ins class="adsbygoogle"
                     id="google-ins"
                     style="display:block;width:300px;height:250px"
                     data-ad-client="ca-pub-2540728945165922"
                     data-ad-slot="9476309341"></ins>
                <img src="${FALLBACK_IMAGE}" id="ad-fallback" 
                     style="position:absolute;top:0;left:0;width:100%;height:100%;display:none;object-fit:cover;">
            </div>
            <button id="skip-ad-btn" disabled 
                style="position:absolute;bottom:40px;padding:12px 30px;background:#222;color:#555;border:1px solid #444;font-weight:bold;cursor:not-allowed;border-radius:5px;">
                Ждите... 5
            </button>
        `;
        document.getElementById('player-container').appendChild(overlay);
    }

    overlay.style.display = 'flex';
    const ins = document.getElementById('google-ins');
    const fallback = document.getElementById('ad-fallback');
    const btn = document.getElementById('skip-ad-btn');

    setTimeout(() => {
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    }, 200);

    setTimeout(() => {
        if (ins.offsetHeight < 10) {
            ins.style.display = 'none';
            fallback.style.display = 'block';
        }
    }, 3000);

    let timeLeft = 5;
    btn.disabled = true;
    btn.style.background = "#222";

    if (adTimerInterval) clearInterval(adTimerInterval);
    adTimerInterval = setInterval(() => {
        timeLeft--;
        btn.innerText = `Пропустить через ${timeLeft}`;
        if (timeLeft <= 0) {
            clearInterval(adTimerInterval);
            btn.disabled = false;
            btn.innerText = "ЗАКРЫТЬ ×";
            btn.style.background = "#fff";
            btn.style.color = "#000";
            btn.style.cursor = "pointer";
            btn.onclick = () => {
                isAdPlaying = false;
                overlay.style.display = 'none';
                lastAdTime = hiddenVideo.currentTime;
                hiddenVideo.play().catch(() => {});
            };
        }
    }, 1000);
}

function finishAd() {
    isAdPlaying = false;
    const overlay = document.getElementById('video-ad-overlay');
    if (overlay) overlay.classList.add('hidden');

    lastAdTime = hiddenVideo.currentTime;
    hiddenVideo.play().catch(e => console.log("Resume failed", e));
}
async function loadAllVideos() {
    const container = document.getElementById("video-feed");
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading videos...</div>';

    try {
        const vRes = await window.db.ref('videos').once('value');
        const uSnap = await window.db.ref('users').once('value');

        const vData = vRes.val() || {};
        const allUsers = uSnap.val() || {};
        const currentUser = getUsername();
        const userAge = getUserAge();

        RecommendationSystem.setVideoList(vData, allUsers, currentUser);
        const sortedIds = RecommendationSystem.getSortedIds();

        container.innerHTML = "";

        sortedIds.forEach((id, index) => {
            const data = vData[id];
            if (!data) return;
            const requiredAge = data.ageRestriction || 0;
            if (userAge < requiredAge) return;
            if (index > 0 && index % 10 === 0) {
                const adCard = document.createElement("div");
                adCard.className = "video-card ad-card-style";
                adCard.innerHTML = `
                    <div class="thumbnail-wrapper ad-box" style="width:100%; min-height:180px; display:flex; justify-content:center; align-items:center; background:#000;">
                         <ins class="adsbygoogle"
                             style="display:inline-block;width:300px;height:180px"
                             data-ad-client="ca-pub-2540728945165922"
                             data-ad-slot="9476309341"></ins>
                    </div>
                    <div class="video-info">
                        <div class="author-avatar-mini" style="background:#FFD700; color:#000; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center;">AD</div>
                        <div class="video-text">
                            <b class="v-title">Спонсорский контент</b>
                            <small class="v-author">Google Ads</small>
                        </div>
                    </div>`;
                container.appendChild(adCard);
                setTimeout(() => {
                    try {
                        (window.adsbygoogle = window.adsbygoogle || []).push({});
                    } catch (e) {}
                }, 500);
            }
            const card = document.createElement("div");
            card.className = "video-card";
            card.onclick = () => window.location.hash = '-=' + id;
            const authorName = data.author || "Guest";
            const uInfo = allUsers[authorName] || {};
            const thumbUrl = data.thumbnail || SVG_PLACEHOLDER;

            const avatarBg = uInfo.avatar ?
                `background-image:url(${uInfo.avatar}); background-size:cover; background-position:center;` :
                `background-color: hsl(${authorName.length * 40}, 70%, 50%);`;

            const avatarContent = uInfo.avatar ? '' : authorName.charAt(0).toUpperCase();

            card.innerHTML = `
                <div class="thumbnail-wrapper">
                    <img src="${thumbUrl}" loading="lazy" onerror="this.src='${SVG_PLACEHOLDER}'">
                </div>
                <div class="video-info">
                    <div class="author-avatar-mini" style="${avatarBg}" onclick="event.stopPropagation(); openChannel('${authorName}')">
                        ${avatarContent}
                    </div>
                    <div class="video-text">
                        <b class="v-title">${data.title}</b>
                        <small class="v-author">${authorName}</small>
                        <small class="v-meta">${data.views || 0} views</small>
                    </div>
                </div>`;
            container.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = "Error loading videos.";
    }
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
                    <img src="${data.thumbnail || SVG_PLACEHOLDER}" onerror="this.src='${SVG_PLACEHOLDER}'">
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
    const authorName = data.author || "Guest";
    authorEl.innerText = authorName;
    document.getElementById('back-btn').classList.remove('hidden');

    const goToChannel = () => openChannel(authorName);
    authorEl.onclick = goToChannel;

    if (avDiv) {
        avDiv.onclick = goToChannel;
        avDiv.style.backgroundImage = 'none';
        avDiv.innerText = '';

        avDiv.innerText = authorName.charAt(0).toUpperCase();
        avDiv.style.backgroundColor = `hsl(${authorName.length * 40}, 70%, 50%)`;

        window.db.ref('users/' + authorName).once('value').then(snap => {
            const uData = snap.val();
            if (uData && uData.avatar) {
                avDiv.style.backgroundImage = `url(${uData.avatar})`;
                avDiv.innerText = "";
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

    loadComments(id);
}

function handleUrlParams() {
    const hash = window.location.hash;
    if (hash.indexOf('#-=') === 0) {
        const vidId = hash.substring(3);
        window.db.ref('videos/' + vidId).once('value').then(snap => {
            if (snap.exists()) openVideoView(snap.val(), vidId);
        });
    } else if (hash.indexOf('#!') === 0) {
        openChannel(decodeURIComponent(hash.substring(2)));
    } else {
        document.body.classList.remove('video-active');
        document.getElementById('video-view-section').classList.add('hidden');
        hiddenVideo.pause();
    }
}

function refreshSource(keepPos = false) {
    if (isAdPlaying) return;

    const pos = hiddenVideo.currentTime;
    const isPaused = hiddenVideo.paused;

    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);

    const blob = new Blob(currentBuffer.filter(Boolean), { type: 'video/mp4' });
    currentBlobUrl = URL.createObjectURL(blob);

    hiddenVideo.src = currentBlobUrl;

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

function toggleCommentsMobile() {
    if (window.innerWidth <= 768) {
        const root = document.getElementById('comments-root');
        root.classList.toggle('expanded');
    }
}

async function startVideoUpload() {
    const title = document.getElementById('v-title').value.trim();
    const btn = document.getElementById('upload-btn');
    const ageLimit = parseInt(document.getElementById('v-age-limit').value) || 0;

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
        views: 0,
        ageRestriction: ageLimit
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

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerText = newTheme === 'dark' ? '🌙' : '☀️';
}

function setPlaybackSpeed(val) { hiddenVideo.playbackRate = parseFloat(val); }

function toggleFullscreen() {
    const container = document.getElementById('player-container');
    if (!document.fullscreenElement) {
        if (container.requestFullscreen) container.requestFullscreen();
        else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
    } else document.exitFullscreen();
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
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    currentBuffer = [];
}

function openUploadModal() { document.getElementById('modal-upload').classList.remove('hidden'); }

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
    const base64String = b64.includes(',') ? b64.split(',')[1] : b64;
    const bin = atob(base64String);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
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

function handleProfileClick() {
    const user = getUsername();
    if (user === "Guest") document.getElementById('modal-auth').classList.remove('hidden');
    else openChannel(user);
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

function showRipple(x, y) {
    const r = document.createElement('div');
    r.className = 'ripple-effect';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 400);
}