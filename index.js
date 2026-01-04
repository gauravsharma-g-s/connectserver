const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv')
const multer = require('multer')
const morgan = require('morgan')
const helmet = require('helmet')
const path = require('path')
const { register, sendOTPVerificationEmail } = require('./controllers/auth')
const { verifyToken } = require('./middleware/auth')
const { createPost } = require('./controllers/posts')
const corsOption = require('./config/corsOptions')
const http = require('http')
const { Server } = require('socket.io')

/* CONFIGURATIONS */
dotenv.config()
const app = express()
const server = http.createServer(app);

/* SOCKET.IO */
const io = new Server(server, {
    cors: corsOption
})


/* Middlewares Setup */
app.use(cors(corsOption))
app.use(express.json())
app.use(helmet())                                                       // For Enhancing the security of Web application by various http header
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }))   // Any domain can access this
app.use(morgan("common"))                                               // Logger 
app.use(bodyParser.json({ limit: "30mb", extended: true }))
app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }))
app.use("/assets", express.static(path.join(__dirname, '/public/assets')))

/* multer middleware */
const storage = new multer.memoryStorage();
const upload = multer({
    storage,
});

/* Routes with Files  */
app.post("/auth/sendOTP", upload.single("picture"), sendOTPVerificationEmail);
app.post("/posts", verifyToken, upload.single("picture"), createPost);

/* ROUTES */
app.post("/auth/register", register);
app.use("/auth", require('./routes/auth'));
app.use("/users", require('./routes/users'))
app.use("/posts", require('./routes/posts'))
app.use("/chats", require('./routes/chats'))

/* MONGOOSE SETUP */
const PORT = process.env.PORT || 6001;
mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    server.listen(PORT, () => console.log(`Server running on PORT ${PORT}`))
}).catch(err => console.log(`${err} cannot connect`))


/* SOCKET IO SETUP */
let users = [];

const addUser = (userId, socketId) => {
    !users.some(user => user.userId === userId) &&
        users.push({ userId, socketId })
}

const removeUser = (socketId) => {
    users = users.filter(user => user.socketId !== socketId)
}

const getUser = (userId) => {
    return users.find(user => user.userId === userId);
}
io.on("connection", (socket) => {
    // FETCH userId and socketId from User
    socket.on("addUser", userId => {
        addUser(userId, socket.id);
        io.emit("getUsers", users);
    });

    socket.on("sendMessage", ({ conversationId, senderId, receiverId, message }) => {
        const receiver = getUser(receiverId);
        receiver && io.to(receiver.socketId).emit("getMessage", {
            conversationId,
            senderId,
            message
        });
    });

    socket.on("disconnect", () => {
        removeUser(socket.id);
        io.emit("getUsers", users)
    });
});



