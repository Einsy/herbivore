import Vue from 'vue'
import store from './store'
import App from './App'
import VueSocketio from 'vue-socket.io'
import { mapGetters } from 'vuex'
import VueD3 from 'vue-d3'

Vue.use(VueD3)
Vue.use(VueSocketio, 'http://localhost:7777')

new Vue({
  el: '#app',
  template: '<App v-bind:vdata="vdata"/>',
  store,
  components: { App },
  data () {
    return {
      vdata: { nodes: [], links: [] },
      packets: []
    }
  },
  computed: mapGetters({
    gateway: 'gateway',
    privateIp: 'privateIp',
    mac: 'mac'
  }),
  sockets: {
    connect: function () {
      console.log('socket connected!')
    },
    info: function (info) {
      this.$store.dispatch('updateNetworkInfo', info)
    },
    updatePublicIp: function (ip) {
      this.$store.dispatch('updatePublicIp', ip)
    },
    listTools: function (toolnames) {
      // Place holder for modular tools if required
      this.$store.dispatch('listTools', toolnames)
    },
    updateHostname: function (node) {
      this.$store.dispatch('updateHostname', node)
    },
    newPacket: function (packet) {
      this.$store.dispatch('newPacket', packet)
    },
    bpfError: function () {
      this.$store.dispatch('bpfError')
    }
  },
  methods: {
    list: function () {
      // Place holder for modular tools if required
      this.$socket.emit('list')
    }
  }
})
