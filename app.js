const dotenv = require('dotenv')
const express = require('express')
const mysql = require('mysql2')
const pino = require('pino')
const pinoHttp = require('pino-http')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const session = require('express-session')
var FileStore = require('session-file-store')(session)
const fs = require('fs')
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions')
}

const { v4: uuidv4 } = require('uuid')
const app = express()
dotenv.config({ path: `env/${process.env.NODE_ENV}.env` })

//apicontroller
const dashBoard = require('./apicontroller/dasboard')
const users = require('./apicontroller/users')
const projects = require('./apicontroller/projects')
const timeSheet = require('./apicontroller/timesheet')

const logger = pino({ 
    level: 'info'
})

app.use(
    pinoHttp({
        logger,
        customLogLevel: (res, err) => (res.statusCode >= 500 ? 'error' : 'info'),
        customSuccessMessage: (req, res) => `Request to ${req.url} processed`,
        genReqId: (req) => {
            req.startTime = Date.now()
            return req.id || uuidv4()
        },
        customAttributeKeys: {
            reqId: 'requestId',
        },
    })
)

app.mysqlClient = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
})  

app.use(express.json())
app.use(cookieParser())

const corsOptions = {
    // origin: 'https://yellowgreen-crow-110465.hostingersite.com',
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow specific methods
    credentials : true,
}
app.use(cors(corsOptions))


app.use(session({ 
    store: new FileStore({
        path: './sessions',
        retries: 0,
        ttl: 1000 * 60 * 60 * 24
    }),
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        secure: false,
    }
}))



// Middleware to log the total process time
app.use((req, res, next) => {
    res.on('finish', () => {
        const processTime = Date.now() - req.startTime
        req.log.info({ processTime }, `Request processed in ${processTime}ms`)
    })
    next()
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
        dashBoard(app)

        app.listen(process.env.APP_PORT, () => {
            logger.info(`listen ${process.env.APP_PORT} port`)
        })
    }
})