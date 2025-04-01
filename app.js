const dotenv = require('dotenv')
const express = require('express')
const mysql = require('mysql2')
const pino = require('pino')
const pinoHttp = require('pino-http')
const cookieParser = require('cookie-parser')
// const cors = require('cors')
const session = require('express-session')
const FileStore = require('session-file-store')(session)
const { v4: uuidv4 } = require('uuid')
const app = express()
dotenv.config({ path: `env/${process.env.NODE_ENV}.env` });

//apicontroller
const users = require('./apicontroller/users')
const projects = require('./apicontroller/projects')
const timeSheet = require('./apicontroller/timesheet')

const logger = pino({ 
    level: 'info'
})

app.use(express.json())
app.use(cookieParser())

// const corsOptions = {
//     origin: 'https://yellowgreen-crow-110465.hostingersite.com',
//     origin: 'http://localhost:3000',
//     methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow specific methods
//     credentials : true,
// }
// app.use(cors(corsOptions));


app.use(session({ 
    store: new FileStore({}),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 *60 * 24,
        secure: false,  // Set to false if not using HTTPS
    }
}))

app.use(
    pinoHttp({
        logger,
        customLogLevel: (res, err) => (res.statusCode >= 500 ? 'error' : 'info'),
        customSuccessMessage: (req, res) => `Request to ${req.url} processed`,
        genReqId: (req) => {
            req.startTime = Date.now();
            return req.id || uuidv4();
        },
        customAttributeKeys: {
            reqId: 'requestId',
        },
    })
)

// Middleware to log the total process time
app.use((req, res, next) => {
    res.on('finish', () => {
        const processTime = Date.now() - req.startTime
        req.log.info({ processTime }, `Request processed in ${processTime}ms`)
    })
    next()
})

app.mysqlClient = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
})    

const pageUsersSessionExclude = [
    '/login/',
    '/api/login/',
    '/users/resetpassword/',
    '/api/users/generateotp/',
    '/api/users/resetpassword/'
]

app.use((req, res, next) => {
    if (pageUsersSessionExclude.includes(req.originalUrl)) {
        return next()
    }
    
    if (req.originalUrl !== '/login/') {
        if (req.session.isLogged !== true) {
            return res.status(401).send('Session expired.')
        }
    }
    return next()
})

app.mysqlClient.connect(function (err){
    if (err) {
        console.log(err)
    } else {
        console.log('mysql connected')

        users(app)
        projects(app)
        timeSheet(app)

        app.listen(process.env.APP_PORT, () => {
            logger.info(`listen ${process.env.APP_PORT} port`)
        })
    }
})