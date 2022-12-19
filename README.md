# @kevingodell/node-red-ui-mp4frag

######
[![GitHub license](https://img.shields.io/badge/license-MIT-brightgreen.svg)](https://raw.githubusercontent.com/kevinGodell/node-red-ui-mp4frag/master/LICENSE)
[![npm](https://img.shields.io/npm/dt/@kevingodell/node-red-ui-mp4frag.svg?style=flat-square)](https://www.npmjs.com/package/@kevingodell/node-red-ui-mp4frag)
[![GitHub issues](https://img.shields.io/github/issues/kevinGodell/node-red-ui-mp4frag.svg)](https://github.com/kevinGodell/node-red-ui-mp4frag/issues)

**A [Node-RED](https://nodered.org/) node used for playing fragmented mp4 video in the [node-red-dashboard](https://github.com/node-red/node-red-dashboard).**

* designed to play fragmented mp4 video using HLS.js, native HLS, or socket.io
* compatible with [@kevingodell/node-red-mp4frag](https://github.com/kevinGodell/node-red-mp4frag)

### Expectations:
* Payload input should be a playlist with links to compatible fragmented mp4 video sources.
* If you have difficulties making it work, please open a new [discussion](https://discourse.nodered.org/) and tag me `@kevinGodell`.
* Do not send private messages asking for help because that will not benefit others with similar issues.

### Installation:
* go to the correct directory, usually ~/.node-red
```
cd ~/.node-red
```
* using npm
```
npm install @kevingodell/node-red-ui-mp4frag
```
* reboot the node-red server
```
node-red-stop && node-red-start
```

### Instructions:
* See the detailed help text in the sidebar.

### Screenshots:

### Flows:
https://github.com/kevinGodell/node-red-ui-mp4frag/tree/master/examples
