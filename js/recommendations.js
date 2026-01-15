const RecommendationSystem = {
    _sortedIds: [],

    CONFIG: {
        USE_FRESHNESS: true,
        USE_PERSONALIZATION: true,
        VIEW_WEIGHT: 1.0,
        LIKE_WEIGHT: 20.0,
        SUB_WEIGHT: 10.0,
        FRESHNESS_LIMIT: 100.0,
        FRESHNESS_DECAY: 48,
        MY_SUB_MULTIPLIER: 1.5,
        RANDOM_VARIATION: 20.0
    },

    setVideoList: function(allVideos, allUsers, currentUser = null, isTrendMode = false) {
        if (!allVideos) return;

        let pool = [];
        const now = Date.now();
        const cfg = this.CONFIG;
        const activeFreshness = isTrendMode ? false : cfg.USE_FRESHNESS;

        // Получаем возраст текущего пользователя (по умолчанию 10 для Guest)
        const userAge = window.USER_AGE_GUEST || 10;

        Object.entries(allVideos).forEach(([id, data]) => {
            // ФИЛЬТРАЦИЯ ПО ВОЗРАСТУ: если видео 18+, а пользователю 10 — пропускаем
            const requiredAge = data.ageRestriction || 0;
            if (userAge < requiredAge) return;

            let score = (data.views || 0) * cfg.VIEW_WEIGHT;

            if (data.likes) {
                score += Object.keys(data.likes).length * cfg.LIKE_WEIGHT;
            }

            const author = data.author;
            if (allUsers && allUsers[author] && allUsers[author].subscribers) {
                const subCount = Object.keys(allUsers[author].subscribers).length;
                score += subCount * cfg.SUB_WEIGHT;
            }

            if (activeFreshness && data.timestamp) {
                const ageInHours = (now - data.timestamp) / (1000 * 60 * 60);
                const freshnessBonus = Math.max(0, cfg.FRESHNESS_LIMIT * Math.exp(-ageInHours / cfg.FRESHNESS_DECAY));
                score += freshnessBonus;
            }

            if (cfg.USE_PERSONALIZATION && currentUser && allUsers && allUsers[author]) {
                if (allUsers[author].subscribers && allUsers[author].subscribers[currentUser]) {
                    score *= cfg.MY_SUB_MULTIPLIER;
                }
            }

            score += Math.random() * cfg.RANDOM_VARIATION;
            pool.push({ id, score });
        });

        pool.sort((a, b) => b.score - a.score);
        this._sortedIds = pool.map(item => item.id);
    },

    getSortedIds: function() {
        return this._sortedIds;
    }
};