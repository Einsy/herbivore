<template>
  <div id="viz-main">
    <svg>
      <defs>
      <linearGradient id="Router" x1="0%" y1="100%" x2="100%" y2="0%" >
        <stop offset="0%" style="stop-color:rgb(191,31,151);stop-opacity:1" />
        <stop offset="100%" style="stop-color:rgb(0,255,255);stop-opacity:1" />
      </linearGradient>
      <linearGradient id="Device" x1="93%" y1="100%" x2="7%" y2="0%" >
        <stop offset="0%" style="stop-color:rgb(148,255,198);stop-opacity:1" />
        <stop offset="100%" style="stop-color:rgb(0,0,255);stop-opacity:1" />
      </linearGradient>
      <linearGradient id="Target" x1="0%" y1="100%" x2="100%" y2="0%" >
        <stop offset="0%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
        <stop offset="100%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
      </linearGradient>
      <linearGradient id="Link" x1="0%" y1="34%" x2="100%" y2="66%" >
        <stop offset="0%" style="stop-color:rgb(15,191,97);stop-opacity:1" />
        <stop offset="100%" style="stop-color:rgb(0,255,255);stop-opacity:1" />
      </linearGradient>
      </defs>
    </svg>
  </div>
</template>

<script>
import Grid from './Grid'
import * as d3Force from 'd3-force'
import {mapGetters} from 'vuex'
import flare from '../../filters'
import {linkStyle, nodeStyle} from './VizTreeStyleParams'
export default {
  name: 'VizTree',
  props: [ ],
  mounted () {
    this.width = this.$el.clientWidth
    this.height = this.$el.clientHeight < 800 ? 250  :this.$el.clientHeight;
  },
  update () {
    console.log("VIZ UPDATE")
  },
  components:{
  },
  data() {
    return {
    i:0,
    g:{},
    dummy: {},
    width: 0,
    height: 0,
    tree: {},
    root: {},
    svg: {},
    largeMax: 20,
    duration: 750,
    shortDuration: 250,
    treeData: {
      id: 0,
      name: "Gateway",
      ip : "",
      router :true,
      children: []
    }
  }},
  sockets:{
    info: function(info){
      this.treeData.ip = this.gateway

      this.treeData.children.push({
          id: 1,
          ip : this.privateIp,
          mac : this.mac,
          router: false
      })
      this.init()
      // Use this for testing
      // setInterval(() => { this.testAddNodes() }, 1000)
      // this.testAddNodes()
    },
    clearStyles: function () {
    },
    clearViz: function () {
    },
    addNode: function(node) {
      const idx = this.treeData.children.length + 1 ;
      node.router = node.ip === this.gateway;
      node.id = idx
      if(node.router){
        this.$store.dispatch('updateRouterMac', node)
      }
      else{

        this.treeData.children.push({
            id: idx,
            ip : node.ip,
            mac : node.mac,
            hostname : node.hostname,
            router: false
        })
        this.$store.dispatch('addNewNode', node)
        let newTree = this.$d3.hierarchy(this.treeData, function(d) { return d.children; });
        let treeData = this.tree(newTree)
        this.root.children.push(treeData.children.pop())
        this.update(this.root)
      }
    }
  },
  computed: mapGetters({
      gateway:'gateway',
      privateIp:'privateIp',
      mac: 'mac',
      gatewayMac: 'gatewayMac',
      currentTool: 'currentTool',
      hoveredNode: 'hoveredNode',
      target: 'target'
  }),
  watch: {
    hoveredNode (val) {
      if (val) {
        this.tableHover(val)
      }
      else{
        this.clearNodesStyles()
      }

    },
    target (val) {
      if (val) {
        this.setTarget(val)
      } else {
        this.clearNodesStyles()
      }
    },
    gatewayMac (val) {
      this.treeData.mac = val
    }
  },
  methods: {
    init: function () {
      this.svg = this.$d3.select("svg")
                    .attr("width", this.width)
                    .attr("height", this.height);
      this.g =  this.svg.append("g").attr("transform", `translate(0,${this.height/4})`)
      this.root = this.$d3.hierarchy(this.treeData, function(d) { return d.children; });
      this.root.x0 = this.width/2;
      this.root.y0 = 0;
      this.root.children.forEach(this.collapse);

      this.tree =  this.$d3.tree()
                            .size([this.width, this.height])
      this.update(this.root)

    },
    update: function (source) {
      let treeData = this.tree(this.root);
      let nodes = treeData.descendants(),
          links = treeData.descendants().slice(1);

      nodes.forEach(function(d){ d.y = d.depth * 100});
      let node = this.g.selectAll("g.node")
          .data(nodes, (d) => { return d.id });

      let nodeEnter = node.enter().append("g")
          .attr("class", "node")
          .attr("transform", function(d) { return "translate(" + source.x0 + "," + source.y0 + ")"; })
          .on('mouseover',this.mouseover())
          .on('mouseout',this.mouseout())
          .on('click', this.clickNode());

      nodeEnter.append('path')
          .attr("class", "icon")
          .attr("d",  (d) => {
            if (d.data.router) {
              return nodeStyle.path.router
            }
            return this.treeData.children.length < this.largeMax ? nodeStyle.path.devices : nodeStyle.path.circle
          })
          .attr("transform", (d) => {
            if (d.data.router) {
              return nodeStyle.transform.router
            }
            return this.treeData.children.length < this.largeMax ? nodeStyle.transform.large : nodeStyle.transform.small
          })
          .attr("fill", function(d) {
              return d.data.router ? "url(#Router)" : "url(#Device)";
          });

      nodeEnter.append('text')
          .attr("transform", (d) => {
            if (d.data.router) {
              return nodeStyle.textTransformRotate.router
            }
            return this.treeData.children.length < this.largeMax ? nodeStyle.textTransformRotate.large : nodeStyle.textTransformRotate.small
          })
          .attr("dx", (d) => {
            if (d.data.router) {
              return nodeStyle.textTransformXOffset.router
            }
            return this.treeData.children.length < this.largeMax ? nodeStyle.textTransformXOffset.large : nodeStyle.textTransformXOffset.small
          })
          .attr("dy", (d) => {
            if (d.data.router) {
              return nodeStyle.textTransformYOffset.router
            }
            return this.treeData.children.length < this.largeMax ? nodeStyle.textTransformYOffset.large : nodeStyle.textTransformYOffset.small
          })
          .attr("fill", function(d) {
              return d.data.router ? "url(#Router)" : "url(#Device)";
          })
          .text(function(d) { return d.data.ip; });

      let nodeUpdate = nodeEnter.merge(node);
      nodeUpdate.transition()
          .duration(this.duration)
          .attr("transform", function(d) {
              return "translate(" + d.x + "," + d.y + ")";
           });

      let nodeExit = node.exit().transition()
        .duration(this.shortDuration)
        .attr("transform", function(d) {
          return "translate(" + source.x + "," + source.y + ")";
        })
        .remove();

      nodeExit.select('circle')
        .attr('r', 1e-6);

      nodeExit.select('text')
        .style('fill-opacity', 1e-6);

      let link = this.g.selectAll('path.link')
          .data(links, function(d) { return d.id; });

      let linkEnter = link.enter().insert('path', "g")
        .attr("class", "link")
        .attr('d', (d) => {
          var o = {x: source.x0, y: source.y0}
          return this.diagonal(o, o)
        })
        .attr("stroke", function(d) { return "url(#Link)";});

      let linkUpdate = linkEnter.merge(link);

      linkUpdate.transition()
        .duration(this.duration)
        .attr('d', (d) => { return this.diagonal(d, d.parent) });

    let linkExit = link.exit().transition()
      .duration(this.shortDuration)
      .attr('d', (d) => {
        var o = {x: source.x, y: source.y}
        return this.diagonal(o, o)
      })
      .attr("stroke", function(d) { return "url(#Link)";})
      .remove();

    nodes.forEach(function(d){
      d.x0 = d.x;
      d.y0 = d.y;
    });
  },
  collapse: function (d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(this.collapse);
        d.children = null;
      }
    },
  click: function(d){
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else {
      d.children = d._children;
      d._children = null;
    }
    this.update(d)
  },
  diagonal: function(s, d) {

   return `M ${s.x} ${s.y}
            C ${s.x} ${(s.y + d.y) / 2},
              ${d.x} ${(s.y + d.y) / 2},
              ${d.x} ${d.y}`
  },
  mouseover: function(){
    const vue = this
    return function (d) {
      if(vue.currentTool === 'Network'){
        vue.clearNodesStyles()
        vue.$d3.select(this).attr('fill','url(#Target)')
        vue.$store.dispatch('setHoverNode', d.data)
      }
    }
  },
    mouseout: function(d) {
      const vue = this
      return function (d) {
        if (vue.currentTool === 'Network') {
          vue.clearNodesStyles()
        }
      }
    },
  clickNode: function (d) {
    const vue = this
    return function (d){
      if (vue.currentTool === 'Network' && !d.data.router) {
        vue.clearNodesStyles()
        vue.$d3.select(this).attr('fill','url(#Target)')
        vue.$store.dispatch('setTarget', d.data)
      }
    }
  },
  tableHover: function (node) {

    this.clearNodesStyles()
    this.$d3.selectAll("path.icon")
            .filter(function(d, i) {  return (typeof d.data === 'undefined') ? false : (d.data.ip === node.ip); })
            .attr('fill','url(#Target)')
    if (this.target){
      const target = this.target
      this.$d3.selectAll("path.icon")
              .filter(function(d, i) { return (typeof d.data === 'undefined') ? false : (d.data.ip === target.ip); })
              .attr('fill','url(#Target)')
    }
  },
  setTarget: function (node) {
    this.clearNodesStyles()
    this.$d3.selectAll("path.icon")
            .filter(function(d, i) { return (typeof d.data === 'undefined') ? false : (d.data.ip === node.ip); })
            .attr('fill','url(#Target)');
  },
  clearNodesStyles: function () {
    this.$d3.selectAll("path.icon")
            .filter(function(d, i) { return typeof d.data !== 'undefined'})
            .attr('fill','url(#Device)')

    this.$d3.selectAll("path.icon")
            .filter(function(d, i) { return (typeof d.data === 'undefined') ? false : d.data.router })
            .attr('fill','url(#Router)')
    if(this.target){
      let target = this.target
      this.$d3.selectAll("path.icon")
              .filter(function(d, i) { return (typeof d.data === 'undefined') ? false : (d.data.ip === target.ip); })
              .attr('fill','url(#Target)');
    }
  },
  testAddNodes: function () {
      const idx = this.treeData.children.length + 1 ;
    this.treeData.children.push({
        id: idx,
        ip : idx,
        mac : '',
        hostname : '',
        router: false
    })
    let newTree = this.$d3.hierarchy(this.treeData, function(d) { return d.children; });
    let treeData = this.tree(newTree)
    this.root.children.push(treeData.children.pop())
    this.update(this.root)
  }
  }
}
</script>

<style>
  .icon {
    /*color: white;*/
  }
  .node circle {
    fill: #fff;
    stroke: steelblue;
    stroke-width: 3px;
  }

  .node text {
    font: 12px sans-serif;
  }

  .link {
    fill: none;
    /*stroke: #ccc;*/
    stroke-width: 2px;
  }
</style>