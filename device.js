
/*
    
    *******************************************************************
                                Hardware Setup
    *******************************************************************






     *******************************************************************

*/

// --------------------------------------------------------------------

var api = 'http://169.254.126.162:3000/'
var usb_mount = '/dev/tty.usbmodemfd1411';

var SerialPort = require('serialport').SerialPort,
    _ = require('underscore'),
    serialPort,
    receivedStr = '',
    spInt, 
    monitor = require('usb-detection');

var triggerDo = function(obj, value){
    console.log('trigger', obj, value);
    _.each(device.config.config, function(config){
        if(config.on.id === obj._id){
            _.each(config.do, function(does){
                var isDo = _.findWhere(device.ioConfigs, { _id: does.id });
                socket.emit('trigger', { channel: device.uuid, settings: isDo });
                if(isDo.type === 'io'){
                    serialPort.write(isDo.settings.port);
                } else {
                    // DO API TRIGGER
                }
            });
        }
    });
};

var setSupportOptions = function(name, isSupported) {
    var feature = _.findWhere(device.ioConfigs, { name: name });
    if(isSupported){
        device.config.supports.push(feature._id);
    } else {
        device.config.supports = _.without(device.config.supports, feature._id);
    }
    device.config.supports = _.unique(device.config.supports);
    request({
        uri: api + 'api/device/' + device.uuid,
        method: 'put',
        timeout: 2000,
        strictSSL: false,
        json: {
            supports: device.config.supports,
        }
    }, function(err, res, body) { });
};

// NFC Detection
var setupHardwareListeners = function(){
    monitor.find(9025, 32822, function(err, devices) {
        if(devices.length > 0){
            setSupportOptions('NFC', true);
            return serialListener();
        }
    });
    monitor.on('add:9025:32822', function(err, devices) {
        setSupportOptions('NFC', true);
        socket.emit('report', { uuid: device.uuid, feature: 'Scanner', supported: true });
        return serialListener();
    });
    monitor.on('remove:9025:32822', function(err, devices) {
        setSupportOptions('NFC', false);
        socket.emit('report', { uuid: device.uuid, feature: 'Scanner', supported: false });
        return serialPort.close();
    });
}

function serialListener() {
    serialPort = new SerialPort(usb_mount, {
        baudrate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: true
    });
    serialPort.open(function() {
        serialPort.on('error', function(data) {
            console.log('error');
        });
        // serialPort.on('data', function(data) {
        //     console.log(data);
        //     clearInterval(spInt);
        //     receivedStr += data.toString().trim();
        //     receivedStr = receivedStr.replace(/(\r\n|\n|\r|\s)/gm, "");
        //     spInt = setTimeout(function() {
        //         try {
        //             var rfid = receivedStr.split('Classic')[1].split('No')[0];
        //             var isOn = _.findWhere(device.ioConfigs, { name: 'NFC' });
        //             if(!_.isEmpty(isOn)){
        //                 triggerDo(isOn, rfid);
        //             }
        //         } catch (err) {}
        //         receivedStr = '';
        //     }, 500);
        // });
        serialPort.write('0');
    });

}


/*
    
    *******************************************************************
                                Device Setup
    *******************************************************************
    1.  check registered
            1a. if fails then registers
            1b. then activates itself
    2.  get the supported IOs to reference self against
    3.  Every 10 minutes it phones home to get the device settings and 
        supported features
     *******************************************************************

*/

// --------------------------------------------------------------------

var request = require('request'),
    http = require('http'),
    async = require('async');

var server = http.createServer().listen(9615);

var io = require('socket.io-client');
var socket = io.connect(api, {reconnect: true});
socket.on('connect', function(socket) { });



// --------------------------------------------------------------------

var device = {
    uuid: '54873747f5b4f6870fe5d15d',
    config: {},
    ioConfigs: {}
};

var setup = function() {
    var registerDevice = function(cb) {
        request({
            uri: api + 'api/device/',
            method: 'post',
            timeout: 2000,
            strictSSL: false,
            json: {
                name: new Date(),
            }
        }, function(err, res, body) {
            return cb(body);
        });
    };
    var checkRegistered = function(cb) {
        request({
            uri: api + 'api/device/' + device.uuid,
            method: 'get',
            timeout: 2000,
            strictSSL: false,
            json: true
        }, function(err, res, body) {
            if (body.success && body.device !== null) {
                device.config = body.device;
                return cb(false, {
                    checkRegistered: true
                });
            } else {
                return cb(true, {
                    checkRegistered: true
                });
            }
        });
    };
    var getSupportOptions = function(cb) {
        request({
            uri: api + 'api/io/',
            method: 'get',
            timeout: 2000,
            strictSSL: false,
            json: true
        }, function(err, res, body) {
            if (body.success) {
                device.ioConfigs = body.ios;
                return cb(false, {
                    getSupportOptions: true
                });
            } else {
                return cb(true, {
                    getSupportOptions: true
                });
            }
        });
    };
    var tasks = [checkRegistered, getSupportOptions];
    async.series(tasks, function(err, results) {
        console.log('Device Running');
        console.log(err, results);
        if (err) {
            registerDevice(function(res) {
                device.uuid = res.device._id;
                console.log(device);
                setup();
            })
        } else {
            socket.emit('subscribe', { channel: device.uuid });
            setupHardwareListeners();
            setTimeout(setup, 100000);
        }
    });
}

setup();







