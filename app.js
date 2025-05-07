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

app.mysqlClient =  mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
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
        secure: false,  //(when http)
        // secure: true,

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

// Session-based user active check
app.use(async (req, res, next) => {
    if (pageUsersSessionExclude.includes(req.originalUrl)) {
      return next()
    }
  
    if (!req.session.user || !req.session.user.userId) {
      return res.status(401).send('Session expired.')
    }
  
    try {
      const [rows] = await app.mysqlClient
        .promise()
        .query(
          /*sql*/`SELECT userId FROM users WHERE userId = ? AND (deletedAt IS NOT NULL OR status = 0)`,
          [req.session.user.userId]
        )
  
      if (rows.length > 0) {
        return res.status(403).json('Account is inactive or deleted by admin.')
      }
  
      next()
    } catch (err) {
      res.status(500).send('Internal server error.')
    }
})
  
app.mysqlClient.getConnection(function (err, connection){
    if (err) {
        console.log(err)
    } else {
        console.log('mysql connected')
        connection.release() // Always release back to pool

        app.mysqlClient.on('connection', (connection) => {
            connection.query(/*sql*/`SET time_zone = '+05:30'`, (err) => {
                if (err) {
                    console.error('Failed to set MySQL timezone:', err)
                } else {
                    console.log('MySQL timezone set to +05:30 for this connection')
                }
            })
        })

        users(app)
        projects(app)
        timeSheet(app)
        dashBoard(app)

        app.listen(process.env.APP_PORT, () => {
            logger.info(`listen ${process.env.APP_PORT} port`)
        })
    }
})

app.mysqlClient.on('error', function (err) {
    console.error('MySQL error occurred:', err)

    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.warn('MySQL connection lost. Attempting to reconnect...')

        // Optionally reconnect automatically (not best for scale, better use pool)
        reconnect()
    } else {
        console.log(err, 'connection error')

        throw err // For other errors, you might want to crash or alert
    }
})

function reconnect() {
    app.mysqlClient = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    })

    app.mysqlClient.connect(err => {
        if (err) {
            console.error('Reconnection attempt failed:', err)
            setTimeout(reconnect, 2000) // Retry after 2 seconds
        } else {
            console.log('Reconnected to MySQL')
        }
    });

    app.mysqlClient.on('error', function (err) {
        console.error('MySQL error after reconnect:', err)
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.log(err.code, 'err.code')

            reconnect()
        } else {
            console.log(err, 'errrrrrrrrrrrrrrrrrrrrrrrrrrrrr')
            throw err
        }
    })
}