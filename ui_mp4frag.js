'use strict';

const dashboard = require('node-red-dashboard');

const initController = require('./lib/initController.js');

const hlsJsPath = require.resolve('hls.js/dist/hls.min.js');

module.exports = RED => {
  const {
    httpNode,
    settings,
    _,
    nodes: { createNode, getNode, registerType },
  } = RED;

  const { addWidget } = dashboard(RED);

  class UiMp4fragNode {
    constructor(config) {
      createNode(this, config);

      try {
        this.group = config.group;

        this.order = config.order || 0;

        this.width = config.width;

        this.height = config.height;

        this.hlsJsConfig = UiMp4fragNode.jsonParse(config.hlsJsConfig);

        this.players = UiMp4fragNode.jsonParse(config.players);

        this.errorPoster = config.errorPoster;

        this.readyPoster = config.readyPoster;

        this.play = config.play === 'true' || config.play === true;

        this.unload = config.unload === 'true' || config.unload === true;

        this.threshold = Number.parseFloat(config.threshold);

        this.containerId = `${UiMp4fragNode.type}_container_${this.id}`;

        this.videoId = `${UiMp4fragNode.type}_video_${this.id}`;

        this.videoOptions = 'preload="metadata" muted playsinline'; // todo: user configurable

        UiMp4fragNode.validateGroup(this.group); // throws

        UiMp4fragNode.validateHlsJsConfig(this.hlsJsConfig); // throws

        UiMp4fragNode.validatePlayers(this.players); // throws

        UiMp4fragNode.validateThreshold(this.threshold); // throws

        ++UiMp4fragNode.nodeCount;

        this.createHttpRoute(); // serve hls.min.js

        this.addToHead(); // adds the script and style to the head (only once)

        this.addToBody(); // adds the html markup to the body

        this.on('close', this.onClose); // listen to the close event

        this.status({ fill: 'green', shape: 'ring', text: _('ui_mp4frag.info.ready') });
      } catch (err) {
        this.error(err);

        this.status({ fill: 'red', shape: 'dot', text: err.toString() });
      }
    }

    static validateGroup(group) {
      const node = getNode(group);

      const type = node && node.type;

      if (type !== 'ui_group') {
        throw new Error(_('ui_mp4frag.error.invalid_ui_group'));
      }
    }

    createHttpRoute() {
      if (UiMp4fragNode.nodeCount === 1) {
        httpNode.get('/ui_mp4frag/hls.min.js', (req, res) => {
          res.sendFile(hlsJsPath, {
            headers: {
              'Cache-Control': 'public, max-age=31536000',
            },
          });
        });
      }
    }

    destroyHttpRoute() {
      if (UiMp4fragNode.nodeCount === 0) {
        const { stack } = httpNode._router;

        for (let i = stack.length - 1; i >= 0; --i) {
          const layer = stack[i];

          if (layer && layer.route && layer.route.path === '/ui_mp4frag/hls.min.js') {
            stack.splice(i, 1);

            break;
          }
        }
      }
    }

    addToHead() {
      if (UiMp4fragNode.nodeCount === 1 && typeof UiMp4fragNode.headDone === 'undefined') {
        UiMp4fragNode.headDone = addWidget({
          node: '',
          group: '',
          order: 0,
          width: 0,
          height: 0,
          format: UiMp4fragNode.renderInHead(),
          templateScope: 'global', // global causes `format` to be inserted in <head>
          emitOnlyNewValues: false,
          forwardInputMessages: false,
          storeFrontEndInputAsState: false,
        });
      }
    }

    removeFromHead() {
      if (UiMp4fragNode.nodeCount === 0 && typeof UiMp4fragNode.headDone === 'function') {
        UiMp4fragNode.headDone();

        UiMp4fragNode.headDone = undefined;
      }
    }

    addToBody() {
      this.bodyDone = addWidget({
        node: this,
        group: this.group,
        order: this.order,
        width: this.width,
        height: this.height,
        format: this.renderInBody(),
        templateScope: 'local', // local causes `format` to be inserted in <body>
        emitOnlyNewValues: false,
        forwardInputMessages: false, // true = we do not need to listen to on input event and manually forward msg
        storeFrontEndInputAsState: false,
        persistantFrontEndValue: true,
        convertBack: value => {
          // console.log('convert back', {value});
          return value;
        },
        beforeEmit: (msg, payload) => {
          // console.log('before emit');
          if (!payload) {
            this.status({ fill: 'green', shape: 'ring', text: _('ui_mp4frag.info.unloaded') });
          } else {
            this.status({ fill: 'green', shape: 'dot', text: _('ui_mp4frag.info.loaded') });
          }
          return { msg };
        },
        beforeSend: (msg, orig) => {
          // console.log('before send', {msg}, {orig});
          if (orig) {
            return orig.msg;
          }
        },
        initController: initController,
      });
    }

    removeFromBody() {
      if (typeof this.bodyDone === 'function') {
        this.bodyDone();

        this.bodyDone = undefined;
      }
    }

    onClose(removed, done) {
      this.removeListener('close', this.onClose);

      --UiMp4fragNode.nodeCount;

      this.destroyHttpRoute();

      this.removeFromHead();

      this.removeFromBody();

      if (removed) {
        this.status({ fill: 'red', shape: 'ring', text: _('ui_mp4frag.info.removed') });
      } else {
        this.status({ fill: 'red', shape: 'dot', text: _('ui_mp4frag.info.closed') });
      }

      done();
    }

    static renderInHead() {
      return String.raw`
<script type="text/javascript" src="/ui_mp4frag/hls.min.js"></script>
<style>
  .nr-dashboard-ui_mp4frag {
    padding: 0;
    overflow: hidden;
  }
  .ui-mp4frag-container {
    width: 100%;
    height: 100%;
  }
  .ui-mp4frag-video {
    width: 100%;
    height: 100%;
    object-fit: fill;
  }
  .ui-mp4frag-controls {
   /* todo */
  }
</style>`;
    }

    renderInBody() {
      const initObj = {
        readyPoster: this.readyPoster,
        errorPoster: this.errorPoster,
        play: this.play,
        unload: this.unload,
        retry: this.retry,
        threshold: this.threshold,
        hlsJsConfig: this.hlsJsConfig,
        videoId: this.videoId,
        players: this.players,
      };

      const initObjStr = JSON.stringify(initObj);

      return String.raw`
<div id="${this.containerId}" class="ui-mp4frag-container" ng-init='init(${initObjStr})'>
  <video id="${this.videoId}" class="ui-mp4frag-video" poster="${this.readyPoster}" ${this.videoOptions}></video>
</div>`;
    }

    static validateHlsJsConfig(hlsJsConfig) {
      if (typeof hlsJsConfig !== 'object' || hlsJsConfig === null) {
        throw new Error(_('ui_mp4frag.error.invalid_hls_js_config'));
      }
    }

    static validatePlayers(players) {
      if (Array.isArray(players) === false || players.length === 0) {
        throw new Error(_('ui_mp4frag.error.invalid_player_order'));
      }
    }

    static validateThreshold(threshold) {
      if (Number.isNaN(threshold) || threshold < 0.1 || threshold > 0.9) {
        throw new Error(_('ui_mp4frag.error.invalid_threshold'));
      }
    }

    static jsonParse(str) {
      try {
        return JSON.parse(str);
      } catch (err) {
        return str;
      }
    }
  }

  UiMp4fragNode.nodeCount = 0; // increment in (successful) constructor, decrement on close event

  UiMp4fragNode.headDone = undefined;

  UiMp4fragNode.type = 'ui_mp4frag';

  registerType(UiMp4fragNode.type, UiMp4fragNode);
};
