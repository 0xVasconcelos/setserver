var net = require('net');
var chalk = require('chalk');
var log = require('./lib/log.js');
var Sequelize = require('sequelize');
var sequelize = new Sequelize('mysql://root:$setufpa@localhost:3306/nodefinger', { logging: false } );

var port = 7000;

// var debugLevel = 1;

var fingerServer = net.createServer(setServer)
    .listen(port, function() {
        log('server', "O servidor está sendo iniciado...");
    })
    .on('connection', function(data){
        log('TCP', 'Conexão estabelecida de ' + chalk.underline(data.remoteAddress + ':' + data.remotePort));
    })
    .on('listening', function(data){
        var host = fingerServer.address().address;
        var port = fingerServer.address().port;
        log('server', 'O servidor foi iniciado em ' + chalk.underline(host + ':' + port));
    })
    .on('error', function(err){
        errorHandler(err);
    });

function setServer(sock){
    sock.setKeepAlive(true, 30000);

    var sessionId;
    var lastID;

    sock.on('data', function(data){
        dataParser(data, sock);
    })
    .on('close', function(data){
        console.log(data);
    })
    .on('error', function(err){
        errorHandler(err);
    });
}

function dataParser(data, sock){
    try{
       data = JSON.parse(data);
    } catch(err){
        errorHandler(err);
    }

    if(data.type === 'conn'){
        log('client', 'O cliente \"' + data.hwid + '\" está tentando se conectar');

        if(data.hwid == 'GT-SET'){
            sessionId = data.hwid;
            sendMessage(sock, 'authok')
            log('server', 'O cliente \"' + data.hwid + '\" foi autenticado com sucesso!');
        }
    }

    if(sessionId){
        switch(data.type){
            case 'fingerid':
                sendMessage(sock, 'fingerid', data.id)
                break;
            case 'addfinger':
                sendMessage(sock, 'addfinger')
                break;
            case 'registerok':
                saveUser(lastID);
                break;
            case 'registerfail':
                log('server', 'Falha na tentativa de registro do novo usuário! ID: ' + lastID);
        }
    }

};

function errorHandler(err){
    switch(err.code){
        case 'EADDRINUSE':
            log('tcperror', chalk.underline('A porta ' + err.port + ' está em uso.'));
            break;
        default:
            log('error', 'Erro desconhecido: ' + err.code);
            break;
    }
}

function sendMessage(sock, type, data){

    switch(type){
        case 'authok':
            sock.write(JSON.stringify({ type: 'conn', 'auth': 'ok', name: "TESTE" }));
            break;
        case 'authfail':
            sock.write(JSON.stringify({ type: 'conn', 'auth': 'fail' }));
            break;
        case 'addfinger':
            getLastID(data, function(data){
                sock.write(JSON.stringify(data));
            })
            break;
        case 'fingerid':
            checkFinger(data, function(data){
                sock.write(JSON.stringify(data));
            })
            break;
    }

}

function checkFinger(id, fn){
    sequelize.query('SELECT * from users WHERE fingerid=' + id).spread(function(results, metadata) {
        if(results[0]){
            fn({ type: "auth",
                auth: "ok",
                admin: results[0].admin,
                name: results[0].name
            });
            log('client', "Nome: " + results[0].name + " | ID do usuário: " + results[0].userid + " | ID biométrico: " + results[0].fingerid);
        } else {
            fn({ type: "auth",
                 auth: "fail"
            })
            log('error', 'Usuário não autorizado! ID: ' + id);
        }
    })
    sequelize.query('INSERT INTO history (fingerid, timestamp) VALUES (' + id + ', ' + Math.floor(new Date() / 1000)+ ')');
}

function getLastID(id, fn){
    sequelize.query('SELECT * FROM `ids` WHERE available = 1 LIMIT 1').spread(function(results, metadata) {
        fn({ type: "register", id: results[0].fingerid });
        lastID = results[0].fingerid;
    })
    log('server', 'O ID: ' + lastID + ' foi enviado para cadastro de novo usuário!');
}

function saveUser(id){
    sequelize.query('INSERT INTO users (userid, name, fingerid) VALUES (\'000000000000\', \'NOVO USUARIO\', \'' + id + '\')');
    sequelize.query('UPDATE `ids` SET available=0 WHERE fingerid=' + lastID);
    log('server', 'Novo usuário cadastrado com sucesso! ID: ' + lastID);
}

