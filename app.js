const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log(`Server Running at http://localhost:3000/`);
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBandServer();

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const getFollowingPeoId = async (username) => {
  const getFollowingPeoQuery = `SELECT following_user_id FROM follower INNER JOIN user 
    ON user.user_id = follower.follower_user_id
    WHERE user.username = '${username}';`;
  const followerPeople = await db.all(getFollowingPeoQuery);
  const Ids = followerPeople.map((eachItem) => eachItem.following_user_id);
  return Ids;
};

const tweetVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `SELECT * FROM tweet INNER JOIN follower 
    ON tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, gender, name } = request.body;
  const getUserQuery = `SELECT *FROM user WHERE username = '${username}';`;
  const userData = await db.get(getUserQuery);

  if (userData !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createRegister = `INSERT INTO user(username, password, name, gender)
        VALUES ('${username}', '${password}', '${name}', '${gender}';`;
      await db.run(createRegister);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userData = await db.get(getUserQuery);
  if (userData !== undefined) {
    const isPasswordTrue = await bcrypt.compare(password, userData.password);
    if (isPasswordTrue) {
      const payload = { username:username, userId: userData.user_id };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;

  const followingPeoplesId = await getFollowingPeoId(username);
  const getTweetQuery = `SELECT username, tweet, date_time as dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE user.user_id IN (${followingPeoplesId})
    ORDER BY date_time DSEC
    LIMIT 4;`;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

app.get("/user/following/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowingUserQuery = `SELECT name FROM follower INNER JOIN 
    user ON user.user_id = follower.following_user_id
    WHERE follower_user_id = '${userId}';`;
  const followingPeople = await db.all(getFollowingUserQuery);
  response.send(followingPeople);
});

app.get("/user/followers/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowerUserQuery = `SELECT name FROM follower INNER JOIN 
    user ON user.user_id = follower.follower_user_id
    WHERE following_user_id = '${userId}';`;
  const follower = await db.all(getFollowingUserQuery);
  response.send(follower);
});

app.get(
  "/tweets/:tweetId/",
  authentication,
  tweetVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `SELECT tweet 
    (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes, 
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
    date_time AS dateTime FROM tweet WHERE tweet.tweet_id = '${tweetId}'
    `;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  tweetVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikestQuery = `SELECT username FROM user INNER JOIN like
    ON user.user_id = like.user_id WHERE tweet_id = '${tweetId}';
    `;
    const likeQuery = await db.all(getLikesQuery);
    const userList = likeQuery.map((eachUser) => eachUser.username);
    response.send({ likes: userList });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  tweetVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `SELECT name, reply FROM user INNER JOIN reply
    ON user.user_id = reply.user_id WHERE tweet_id = '${tweetId}';
    `;
    const RepliesQuery = await db.all(getRepliesQuery);

    response.send({ replies: RepliesQuery });
  }
);

app.get(
  "/user/tweets/",
  authentication,

  async (request, response) => {
    const { userId } = request;
    const getTweetQuery = `SELECT tweet, 
    COUNT(DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id) AS replies,
    date_time AS dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;
    `;
    const TweetQuery = await db.all(getTweetQuery);

    response.send(TweetQuery);
  }
);

app.post(
  "/user/tweets/",
  authentication,

  async (request, response) => {
    const { tweet } = request.body;
    const userId = parseInt(request.userId);
    const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
    const createTweetQuery = `INSERT INTO tweet(tweet,userId,dateTime)
      VALUES('${tweet}', '${userId}', '${dateTime}';`;
    await db.run(createTweetQuery);
    response.send("Created a Tweet");
  }
);

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const getTweetQuery = `SELECT * FROM tweet WHERE user_id = '${userId}
      AND tweet_id = '${tweetId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweet = `DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
    await db.run(deleteTweet);
    response.send("Tweet Removed");
  }
});

module.exports = app;
