const RecommendationSystem = {
    _sortedIds: [],

    setVideoList: function(allVideos, allUsers, currentUser = null) {
        if (!allVideos) return;

        let pool = [];
        const now = Date.now();

        Object.entries(allVideos).forEach(([id, data]) => {
            let score = (data.views || 0) * 1.0;

            if (data.likes) {
                score += Object.keys(data.likes).length * 15;
            }
            const author = data.author;
            if (allUsers && allUsers[author] && allUsers[author].subscribers) {
                const subCount = Object.keys(allUsers[author].subscribers).length;
                score += subCount * 5;
            }
            if (data.timestamp) {
                const ageInHours = (now - data.timestamp) / (1000 * 60 * 60);
                const freshnessBonus = Math.max(0, 1000 / (ageInHours + 1));
                score += freshnessBonus;
            }
            if (currentUser && allUsers && allUsers[author]) {
                if (allUsers[author].subscribers && allUsers[author].subscribers[currentUser]) {
                    score *= 2.5;
                }
            }
            score += Math.random() * 50;

            pool.push({ id, score });
        });
        pool.sort((a, b) => b.score - a.score);
        this._sortedIds = pool.map(x => x.id);
    },

    listVideo: function() {
        return this._sortedIds;
    }
};