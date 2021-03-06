const axios = require('axios');
require('dotenv').config();
const dateFns = require('date-fns');
const twitter = require('twitter-lite');

const intervalHours = 4;
const getTimeSpentOnTwitterInLastFourHours = async () => {
    const url = `https://www.rescuetime.com/anapi/data`;
    console.log('Getting time spent on twitter in last 4 hours');
    const rescueTimeResponse = await axios({
        url,
        params: {
            format: 'json',
            key: process.env.RECUETIME_API_KEY,
            perspective: 'interval',
            restrict_kind: 'activity',
            restrict_begin: dateFns.format(dateFns.startOfToday(), 'yyyy-MM-dd'),
            restrict_end: dateFns.format(dateFns.startOfTomorrow(), 'yyyy-MM-dd'),
            resolution_time: 'minute',
        }
    })
    const rows = rescueTimeResponse.data.rows;
    const filteredRows = rows.filter(row => row[3].toLowerCase().includes('twitter') || row[3].toLowerCase().includes('tweet'));
    const lastInterval = filteredRows.filter(row => {
        const parsedDate = dateFns.parseJSON(`${row[0]}-04:00`);
        const diff = dateFns.differenceInHours(Date.now(), parsedDate);
        return diff <= intervalHours
    });
    const sum = lastInterval.reduce((acc, row) => {
        return acc + row[1]     
    }, 0);
    console.log(`Time spent on twitter in last ${intervalHours} hours: ${sum} seconds`);
    return sum;
}

const clientV1 = new twitter({
    version: '1.1',
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

// 1. Use twitter client to fetch tweets and replies in the last hour
// 2. Store the count of tweets and replies in a variable
// 3. Send a DM to the user with the count of tweets and replies and the total time spent on twitter in last hour
const getTweetsAndReplies = async (totalTimeOnTwitter) => {
    console.log(`Getting tweets and replies in the last ${intervalHours} hours`);
    let tweets = [];
    try {
        tweets = await clientV1.get(`statuses/user_timeline`, {
            screen_name: process.env.TWITTER_USERNAME,
            count: 200,
            exclude_replies: false,
            include_rts: false,
        });
    } catch (e) {
        if ('errors' in e) {
            // Twitter API error
            if (e.errors[0].code === 88) {
                // rate limit exceeded
                console.log("Rate limit will reset on", new Date(e._headers.get("x-rate-limit-reset") * 1000));
            }
            else {
                console.log(e.errors[0].message);
            }
        } else {
            console.log(e);
        }
    }
    const tweetsCount = tweets.filter(t => {
        const parsedDate = dateFns.parse(t.created_at, "EEE MMM dd HH:mm:ss x yyyy", new Date());
        const diffInHours = dateFns.differenceInHours(Date.now(), parsedDate);
        return diffInHours <= intervalHours
    }).length;
    const totalTimeOnTwitterInMinutes = dateFns.secondsToMinutes(totalTimeOnTwitter);
    const rate = tweetsCount / totalTimeOnTwitterInMinutes;
    const messageContents = `
Total tweets in the last ${intervalHours} hours: ${tweetsCount}
Time spent: ${totalTimeOnTwitterInMinutes} minutes
Rate of engagement: ${(typeof rate === 'number') ? rate.toFixed(2) : 'N/a'} tweets/minute`;
    console.log(`Sending message to user: ${messageContents}`);
    const twitterUser = await clientV1.get('users/show', {
        screen_name: process.env.TWITTER_USERNAME
    });
    try {
        await clientV1.post('direct_messages/events/new', {
            event: { 
                "type": "message_create", 
                "message_create": { 
                    "target": { "recipient_id": twitterUser.id_str },
                    "message_data": { "text": messageContents }
                }
            }
        });
    } catch (e) {
        if ('errors' in e) {
            // Twitter API error
            if (e.errors[0].code === 88) {
                // rate limit exceeded
                console.log("Rate limit will reset on", new Date(e._headers.get("x-rate-limit-reset") * 1000));
            }
            else {
                console.log(e.errors[0].message);
            }
        } else {
            console.log(e);
        }
    }
    const telegramData = {
        'chat_id': process.env.TELEGRAM_CHAT_ID,
        'text': messageContents
    }
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_API_KEY}/sendMessage`, telegramData)
};

const justDoIt = async () => {
    const timeOnTwitter = await getTimeSpentOnTwitterInLastFourHours(); // total time spent on twitter in last hour
    if (timeOnTwitter === 0) return;
    await getTweetsAndReplies(timeOnTwitter);
}

justDoIt()