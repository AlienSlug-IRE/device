/*
    
    *******************************************************************
                                Hardware Setup
    *******************************************************************






     *******************************************************************

*/

// --------------------------------------------------------------------

var api = 'http://ubd-odonoghue.rhcloud.com/';
var socketUrl = 'http://ubd-odonoghue.rhcloud.com:8000'
// var usb_mount = '/dev/tty.usbmodemfd1411';
// var usb_mount_led = '/dev/tty.usbmodemfd1431';
var usb_mount = '/dev/ttyACM0';
var usb_mount_led = '/dev/ttyACM1';

var SerialPort = require('serialport').SerialPort,
    _ = require('underscore'),
    serialPort,
    serialPortLED,
    receivedStr = '',
    spInt,
    monitor = require('usb-detection');

var request = require('request'),
    http = require('http'),
    async = require('async');
console.log(socketUrl);


var server = http.createServer().listen(9615),
    io = require('socket.io-client'),
    socket = io.connect(socketUrl, {
        reconnect: true
    });

socket.on('do', function(data) {
    console.log('Device Commanded', data);
    // triggerDo({ _id: data._id }, data.value);  
    try {
        serialPortLED.write(data.value);
    } catch (err) {};
});

var triggerDo = function(obj, value) {
    socket.emit('trigger', {
        channel: device.uuid,
        io: obj,
        value: value
    });
    _.each(device.config.config, function(config) {
        if (config.on.id === obj._id) {
            _.each(config.do, function(does) {
                var isDo = _.findWhere(device.ioConfigs, {
                    _id: does.id
                });
                if (isDo.type === 'io') {
                    serialPort.write(isDo.settings.port);
                }
            });
        }
    });
};

var setSupportOptions = function(name, isSupported) {
    var feature = _.findWhere(device.ioConfigs, {
        name: name
    });
    socket.emit('report', {
        uuid: device.uuid,
        feature: name,
        id: feature._id,
        supported: isSupported
    });
    if (isSupported) {
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
    }, function(err, res, body) {});
    return;
};

// Detection
var setupHardwareListeners = function() {
    monitor.find(9025, 32822, function(err, devices) {
        if (devices.length > 0) {
            // return serialListener();
        }
    });
    monitor.on('add:9025:32822', function(err, devices) {
        // setSupportOptions('NFC', true);
        // socket.emit('report', {
        //     uuid: device.uuid,
        //     feature: 'NFC',
        //     supported: true
        // });
        serialListener();
    });
    monitor.on('remove:9025:32822', function(err, devices) {
        // setSupportOptions('NFC', false);
        // socket.emit('report', {
        //     uuid: device.uuid,
        //     feature: 'NFC',
        //     supported: false
        // });
        // serialPort.close();
        // serialPortLED.close();
        // return serialListener();
    });
    serialListener();
}

function serialListener() {
    serialPort = new SerialPort(usb_mount, {
        baudrate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: true
    });
    serialPort.open(function(err) {
        serialPort.on('error', function(data) {
            console.log('NFC error');
            try {
                serialPort.close();
            } catch (err) {}

        });
        if (err) {
            console.log(err);
            setSupportOptions('NFC', false);
        } else {

            serialPort.on('close', function(data) {
                console.log('NFC closed');
                setSupportOptions('NFC', false);
            });
            serialPort.on('data', function(data) {
                clearInterval(spInt);
                receivedStr += data.toString().trim();
                receivedStr = receivedStr.replace(/(\r\n|\n|\r|\s)/gm, "");
                spInt = setTimeout(function() {
                    try {
                        var rfid = receivedStr.split('Classic')[1].split('No')[0];

                        var isOn = _.findWhere(device.ioConfigs, {
                            name: 'NFC'
                        });
                        console.log(rfid);
                        if (!_.isEmpty(isOn)) {
                            triggerDo(isOn, rfid);
                        }
                    } catch (err) {}
                    receivedStr = '';
                }, 1000);
            });
            console.log('NFC connected');
            setSupportOptions('NFC', true);
        }
    });
    serialPortLED = new SerialPort(usb_mount_led, {
        baudrate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        flowControl: true
    });
    serialPortLED.open(function(err) {
        serialPortLED.on('error', function(data) {
            console.log('LED Error');
            try {
                serialPortLED.close();
            } catch (err) {}
        });
        if (err) {
            setSupportOptions('LED', false);
        } else {

            serialPortLED.on('close', function(data) {
                console.log('LED closed');
                setSupportOptions('LED', false);
            });
            serialPortLED.on('data', function(data) {
                // do nothing as it's LED
            });
            console.log('LED connected');
            setSupportOptions('LED', true);
            serialPortLED.write('2');
        }
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


socket.on('connect', function(socket) {
    console.log('Socket Established');
});



// --------------------------------------------------------------------

var device = {
    uuid: '54ad9afd238a170000d7094f',
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
        console.log('Device Running', results);
        if (err) {
            registerDevice(function(res) {
                device.uuid = res.device._id;
                console.log(device);
                setup();
            })
        } else {
            socket.emit('subscribe', {
                channel: device.uuid
            });

            setupHardwareListeners();
            setTimeout(setup, 100000);
        }
    });
}
setup();