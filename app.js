var net = require('net');
var chalk = require('chalk');
var log = require('./lib/log.js');

var debugLevel = 1;

var fingerServer = net.createServer(setServer)
    .listen(7000, function() {
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
    sock.on('data', function(data){
        dataParser(data);
    });

    sock.on('close', function(data){
        console.log(data);
    });
}

function dataParser(data){
    log('data', data)
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
