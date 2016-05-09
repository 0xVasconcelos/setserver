var net = require('net');                       //Biblioteca para iniciar os sockets TCP
var chalk = require('chalk');                   //Biblioteca para colorir a saída no console
var log = require('./lib/log.js');              //Importa o arquivo log para algumas funções
var Sequelize = require('sequelize');           //Biblioteca para ORM em MySQL
//Inicia conexão com o DB MySQL através do Sequelize
var sequelize = new Sequelize('mysql://root:$setufpa@localhost:3306/nodefinger', { logging: false } );
/* Configuração do cliente que vai ser conectado 
    `config.port` é a porta que o servidor TCP será iniciado
    `config.hwid` é o id de identificação do hardware do SET FINGER
    `config.name` é o nome que será apresentado na tela de boas-vindas do SET FINGER
*/
var config = {};    
    config.port = 7000;
    config.hwid = 'GT-SET';
    config.name = 'GT-SET';
/* Aqui é iniciado o servidor TCP na porta determinada em `config.port`, a função que será executada para cada conexão
    feita ao servidor será a função `setServer`, ela ficará responsável pelo tratamento dos sockets criados com o servidor TCP.
*/
var fingerServer = net.createServer(setServer)
    /* Evento disparado quando o servidor está sendo iniciado */
    .listen(config.port, () => log('server', "O servidor está sendo iniciado..."))
    /* Evento disparado quando uma nova conexão é estabelecida com o servidor TCP */
    .on('connection', (data) => log('TCP', 'Conexão estabelecida de ' + chalk.underline(data.remoteAddress + ':' + data.remotePort)))
    /* Evento disparado quando o servidor é iniciado com sucesso na porta especificada */
    .on('listening', (data) => log('server', 'O servidor foi iniciado em ' + chalk.underline(fingerServer.address().address + ':' + fingerServer.address().port)))
    /* Evento disparado quando acontece algum erro no servidor TCP, o error é tratado pela função `errorHandler` */
    .on('error', (err) => errorHandler(err));

/* Função que trata os sockets TCP, iniciados por fingerServer */
function setServer(sock){
    /* Variável que armazena o id de hardware do SE TFINGER*/
    var sessionId;
    /* Variável que armazena o último ID que foi passado ao SET FINGER para fins de registro de novo usuário*/
    var lastID;
    /* Ativa o keepAlive no socket para que o gateway da rede não mate a conexão por inatividade */
    sock.setKeepAlive(true, 30000)
    /* Evento disparado quando algum dado é recebido, ele é tratado pela função `dataParser` */
    .on('data', (data) => dataParser(data, sock))
    /* Evento disparado quando alguma conexão é fechada, tratada pela função `errorHandler` */
    .on('close', (data) => errorHandler(data))
    /* Evento disparado quando acontece algum erro no socket, tratada pela função `errorHandler`*/
    .on('error', (err) => errorHandler(err));
}

function dataParser(data, sock){
    /* Como os dados enviados pelo SET FINGER estão no formato JSON, ele tenta tratar esses dados, caso não consiga, 
    é disparado um erro, que é tratado pela função `errorHandler`
    Caso o dado seja tratado com sucesso, ele então é convertido de string JSON para um objeto do JavaScript
    */
    try{
       data = JSON.parse(data);
    } catch(err){
        errorHandler(err);
    }
    /* Caso o tipo da mensagem seja do tipo 'conn', indica que é um cliente tentando se conectar ao servidor
       Se o hwid da mensagem for válido(igual ao configurado em config.hwid) ele está autorizado, então o hwid é atribuido
       ao sessionId.
    */
    if(data.type === 'conn'){
        log('client', 'O cliente \"' + data.hwid + '\" está tentando se conectar');
        if(data.hwid == config.hwid){
            sessionId = data.hwid;
            sendMessage(sock, 'authok')
            log('server', 'O cliente \"' + data.hwid + '\" foi autenticado com sucesso!');
        }
    }
    /* Se sessionId estiver definido, ele então trata as próximas mensagens que serão enviadas pelo SET FINGER*/
    if(sessionId){
        switch(data.type){
            /* Quando o SET FINGER tenta autorizar algum cliente ele envia o tipo `fingerid` que é tratado pela função
            sendMessage */
            case 'fingerid':
                sendMessage(sock, 'fingerid', data.id)
                break;
            /* Quando o SET FINGER tenta cadastrar um novo cliente ele envia o tipo `fingerid` que é tratado pela função
            sendMessage */
            case 'addfinger':
                sendMessage(sock, 'addfinger')
                break;
            /* Quando o novo usuário foi cadastrado com sucesso no sensor biométrico, ele manda uma mensagem de sucesso,
                então o servidor armazena no banco o ID que foi passado ao SET FINGER
            */
            case 'registerok':
                saveUser(lastID);
                break;
            /*
                Quando algum erro acontece no registro do novo usuário no sensor biométrico
            */
            case 'registerfail':
                log('server', 'Falha na tentativa de registro do novo usuário! ID: ' + lastID);
                break;
        }
    }
}

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
            sock.write(JSON.stringify({ type: 'conn', 'auth': 'ok', name: config.name }));
            break;
        case 'authfail':
            sock.write(JSON.stringify({ type: 'conn', 'auth': 'fail' }));
            break;
        case 'addfinger':
            getLastID(data, (data) => sock.write(data));
            break;
        case 'fingerid':
            checkFinger(data, (data) => sock.write(data));
            break;
    }
}

function checkFinger(id, fn){
    sequelize.query('SELECT * from users WHERE fingerid=' + id).spread(function(results, metadata) {
        if(results[0]){
            fn(JSON.stringify({ type: "auth", auth: "ok", admin: results[0].admin, name: results[0].name }));
            log('client', "Nome: " + results[0].name + " | ID do usuário: " + results[0].userid + " | ID biométrico: " + results[0].fingerid);
        } else {
            fn(JSON.stringify({ type: "auth", auth: "fail" }));
            log('error', 'Usuário não autorizado! ID: ' + id);
        }
    })
    sequelize.query('INSERT INTO history (fingerid, timestamp) VALUES (' + id + ', ' + Math.floor(new Date() / 1000)+ ')');
}

function getLastID(id, fn){
    sequelize.query('SELECT * FROM `ids` WHERE available = 1 LIMIT 1').spread(function(results, metadata) {
        fn(JSON.stringify({ type: "register", id: results[0].fingerid }));
        lastID = results[0].fingerid;
    })
    log('server', 'O ID: ' + id + ' foi enviado para cadastro de novo usuário!');
}

function saveUser(id){
    sequelize.query('INSERT INTO users (userid, name, fingerid) VALUES (\'000000000000\', \'NOVO USUARIO\', \'' + id + '\')');
    sequelize.query('UPDATE `ids` SET available=0 WHERE fingerid=' + lastID);
    log('server', 'Novo usuário cadastrado com sucesso! ID: ' + lastID);
}
