var net = require('net');
var chalk = require('chalk');
var log = require('./lib/log.js');
var Sequelize = require('sequelize');
var sequelize = new Sequelize('mysql://root:$setufpa@localhost:3306/nodefinger');

var Users = sequelize.define('users', {
    name: Sequelize.STRING,
    userid: Sequelize.TEXT,
    fingerid: Sequelize.INTEGER,
    admin: Sequelize.INTEGER,
    active: Sequelize.INTEGER
})


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
    log('data', data);


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
        case 'fingerid':
            checkFinger(data)
            sock.write(JSON.stringify({type: 'auth', auth: 'fail'}));
            break;
    }

}

function checkFinger(id){
    Users.findAll({
        where: { id: 1 }
    })
}

