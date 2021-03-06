const arp = require('arp-a')
const ping = require('ping')
const network = require('network')
const oui = require('oui')
const spawn = require('child-process-promise').spawn
const exec = require('child_process').exec

class Network {

  constructor (debug = false) {
    this.name = 'Network'
    this._client = null
    this.logDebug = debug
    this.tbl = []
    this.unresolvedIps = []
    this.public = ''
    this.local = ''
    this.gw = ''
    this.subnet = ''
    this.mac = ''
    this.interface = ''
    this.netmask = ''
    this.type = ''
    this.hostInterval = null
    this.hostIntervalPeriod = 1000
  }

  info (msg) {
    console.log(`[ INFO ] [${this.name}]: ${msg}`)
  }

  debug (msg) {
    if (this.logDebug) {
      console.log(`[ DEBUG ] [${this.name}]: ${msg}`)
    }
  }

  error (msg) {
    console.log(`[ ERROR ] [${this.name}]: ${msg}`)
  }

  set client (socket) {
    this._client = socket
  }

  get client () {
    return this._client
  }

  init () {
    if (this.local === '') {
      this._checkHost()
      network.get_active_interface((err, obj) => {
        if (err) {
          const data = { iface: 'No active interface', connected: false }
          this._client.emit('info', data)
          this.error('get_active_interface : ' + err.message)
          return
        }

        if (!obj) {
          const data = { iface: 'No active interface', connected: false }
          this._client.emit('info', data)
          this.error('get_active_interface:  no interface found')
          return
        }

        this.local = obj.ip_address
        this.gw = obj.gateway_ip
        this.interface = obj.name
        this.netmask = obj.netmask
        this.mac = obj.mac_address
        this.vendor = oui(obj.mac_address).split('\n')[0]
        this.subnet = this.gw.split('.')
        this.subnet.pop()
        this.type = obj.type

        const data = { connected: true,
          self: true,
          privateIp: this.local,
          iface: this.interface,
          gateway: this.gw,
          netmask: this.netmask,
          mac: this.mac,
          type: this.type,
          vendor: this.vendor
        }

        this._pingSubnet()

        if (this._client) {
          this._client.emit('info', data)
          try {
            this._getHostName(this.local)
          } catch (err) {
            this.error(err)
          }
        } else {
          this.error('Client socket not found!')
        }

        if (this.tbl.length === 0) {
          try {
            this._scanArpTable()
          } catch (err) {
            this.error(err)
          }
        }

        if (this.public === '') {
          network.get_public_ip((err, ip) => {
            if (err) return this.error(' get public ip: ' + err.message)
            if (!ip) return this.error(' get public ip:  no ip found')
            this.info(`public: ${ip} `)
            this.public = ip
            if (this._client) {
              this._client.emit('updatePublicIp', this.public)
            } else {
              this.error('Client socket not found!')
            }
          })
        }
      })
    }
  }

  _getHostNamePromise (ip) {
    this.info(`Finding host for ip: ${ip}`)
    // TODO: Add linux version
    spawn('dig', ['-x', ip, '-p', '5353', '@224.0.0.251'], { capture: ['stdout', 'stderr'] })
    .then((result) => {
      const text = result.stdout.toString()
      const lines = text.split('\n')
      console.log(lines)
      const line = lines[11]
      const hostAdd = line.split('\t').pop()
      const hostname = hostAdd.split('.')[0]
      this._client.emit('updateHostname', { ip: ip, hostname: hostname })
    })
    .catch(function (err) {
      this.error(err.stderr)
    })
  }

  _getHostName (ip) {
    this.debug(`Finding host for ip: ${ip}`)
    // TODO: Add linux version
    exec(`dig -x ${ip} -p 5353 @224.0.0.251`, (err, stdout, stderr) => {
      if (err) { this.debug(`err: ${ip} ${err} `); return }
      if (stderr) { this.debug(`err: ${ip} ${stderr} `); return }
      const text = stdout
      const lines = text.split('\n')
      const line = lines[11]
      if (typeof line === 'undefined') {
        return
      }
      const hostAdd = line.split('\t').pop()
      const hostname = hostAdd.split('.')[0]
      this.debug(`ip: ${ip} hostname: ${hostname}`)
      this._client.emit('updateHostname', { ip: ip, hostname: hostname })
    })
  }

  _scanArpTable () {
    arp.table((err, entry) => {
      if (err) return console.log('arp: ' + err.message)
      if (!entry) return
      const t = entry.ip.split('.')
      t.pop()

      if (this.interface !== entry.ifname) {
        this.debug(`wrong interface: ${entry.ifname} ${this.interface} `)
        return
      }

      if (entry.mac === 'ff:ff:ff:ff:ff:ff') {
        this.debug(`ignore broadcast: ${entry.ifname} ${this.mac} `)
        return
      }

      if (t.join('.') !== this.subnet.join('.')) {
        this.debug(`wrong subnet: ${t} ${this.subnet} `)
        return
      }

      const exisiting = this.tbl.filter((e) => {
        return e.mac === entry.mac
      })

      if (exisiting.length > 0) {
        this.debug(`Ignoring ${entry.mac} as it already exists`)
        return
      }

      this.tbl.push(entry)

      this.debug(`Found device: ${entry.mac} `)
      if (this._client) {
        const vendorInfo = oui(entry.mac)
        if (vendorInfo != null && vendorInfo.indexOf('\n') > -1) {
          entry.vendor = vendorInfo.split('\n')[0]
        } else {
          entry.vendor = ''
        }

        entry.hostname = ''
        this._client.emit('addNode', entry)
        this.unresolvedIps.push(entry.ip)
      } else {
        this.error('Client socket not found!')
      }
    })
  }

  _pingSubnet () {
    const subnet = this.gw.split('.')
    subnet.pop()
    for (var i = 0; i < 255; i++) {
      const n = this.subnet.concat(i)
      const toPing = n.join('.')
      ping.sys.probe(toPing, function (isAlive) {
        var msg = isAlive ? 'host ' + toPing + ' is alive' : 'host ' + toPing + ' is dead'
        if (isAlive) {
          this.info(msg)
        }
      })
    }
  }

  _getAllHostnames (index) {
    if (index >= this.ips.length) {
      this.info('Completed Hosts')
    } else {
      const ip = this.ips[index]
      this.debug(`Finding hostname for ${ip}`)
      exec(`dig -x ${ip} -p 5353 @224.0.0.251`, (err, stdout, stderr) => {
        if (err) { this.debug(`err: ${ip} ${err} `); return }
        if (stderr) { this.debug(`err: ${ip} ${stderr} `); return }
        const text = stdout
        const lines = text.split('\n')
        const line = lines[11]
        const hostAdd = line.split('\t').pop()
        const hostname = hostAdd.split('.')[0]
        this.info(hostname)
        this._client.emit('updateHostname', { ip: ip, hostname: hostname })
        index = index + 1
        this._getAllHostnames(index)
      })
    }
  }

  _checkHost () {
    if (this.hostInterval) {
      clearInterval(this.hostInterval)
      this.hostInterval = null
      this._checkHost()
    } else {
      this.hostInterval = setInterval(() => {
        this._getHostBuffer()
      }, this.hostIntervalPeriod)
    }
  }

  _getHostBuffer () {
    const bufferSize = 10
    if (this.unresolvedIps.length < 1) {
      // this.info(`No unresolved Ips`)
      return
    } else {
      let cur = []
      if (this.unresolvedIps.length > bufferSize) {
        cur = this.unresolvedIps.splice(0, bufferSize)
      } else {
        cur = this.unresolvedIps.splice(0, this.unresolvedIps.length)
      }
      this.info(`Finding hostnames for: ${cur.length} devices and still have ${this.unresolvedIps.length} devices remaining`)
      for (const c in cur) {
        this._getHostName(cur[c])
      }
    }
  }

  _clear () {
    this.info('Clearing network info')
    this.tbl = []
    this.unresolvedIps = []
    this.public = ''
    this.local = ''
    this.gw = ''
    this.subnet = ''
    this.mac = ''
    this.interface = ''
    this.netmask = ''
    this.type = ''
    this.hostInterval = null
  }

  cmd (name, ...args) {
    if (name === 'rescan') {
      this.info('Rescanning network...')
      this._pingSubnet()
      setTimeout(() => {
        this._scanArpTable()
      }, 500)
    } else if (name === 'clear') {
      this._clear()
    }
  }

  start (socket) {
  }

  stop (socket) {
  }

}
module.exports = Network
// _scanLan () {
//   const subnet = this.gw.split('.')
//   subnet.pop()
//   let promises = []
//   for (var i = 0; i < 255; i++) {
//     let n = this.subnet.concat(i)
//     let toPing = n.join('.')
//     promises.push(this.arpPromise(toPing))
//   }

//   Promise.all(promises)
//   .then( (result) => {
//     result.forEach((r) => {
//       if(r.mac !== '(incomplete)'){
//         r.vendor = oui(r.mac).split('\n')[0]
//         this._client.emit('addNode', r)
//       }
//     })

//   })
//   .catch(function (err) {
//       console.error('[spawn] stderr: ', err);
//   })
// }
