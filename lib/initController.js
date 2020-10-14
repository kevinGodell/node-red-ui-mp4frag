'use strict';

module.exports = ($scope, events) => {
  const waitForIt = (expression, maxRetry, retryDelay) => {
    let attempt = 0;

    return new Promise((resolve, reject) => {
      const checkExpression = () => {
        if (expression() === true) {
          return resolve(true);
        }

        if (++attempt > maxRetry) {
          return reject({ expression: expression.toString(), maxRetry, retryDelay });
        }

        setTimeout(checkExpression, retryDelay);
      };

      checkExpression();
    });
  };

  const extractVideoData = payload => {
    let type = 'unknown';

    let source = payload;

    if (typeof payload === 'string') {
      if (payload.endsWith('.m3u8') === true) {
        type = 'hls';
        /* } else if (payload.endsWith('socket.io') === true) {
          type = 'socket.io';*/
      } else if (payload.endsWith('.mp4') === true) {
        type = 'mp4';
      }
    } else if (typeof payload === 'object') {
      const { hlsPlaylist, socketIo, mp4File } = payload;

      if (typeof hlsPlaylist === 'string' && hlsPlaylist.endsWith('.m3u8') === true) {
        type = 'hls';

        source = hlsPlaylist;
      } else if (typeof socketIo === 'object') {
        // } && socketIo.path.endsWith('socket.io') === true) {

        const { path, namespace } = socketIo;

        if (typeof path === 'string' && typeof namespace === 'string') {
          type = 'socket.io';

          source = { path, namespace };
        }
      } else if (typeof mp4File === 'string' && mp4File.endsWith('.mp4') === true) {
        type = 'mp4';

        source = mp4File;
      }
    }

    return {
      type,
      source,
    };
  };

  const hasHlsJs = () => {
    return /* typeof Hls === 'function' && */ Hls.isSupported() === true;
  };

  const hasHlsNative = () => {
    return $scope.video.canPlayType('application/vnd.apple.mpegurl') !== '';
  };

  const restartVideo = () => {
    console.log(`restart video ${$scope.video.id}`);

    if (typeof $scope.restartTimeout !== 'undefined') {
      clearTimeout($scope.restartTimeout);
    }

    $scope.restartTimeout = setTimeout(() => {
      $scope.restartTimeout = undefined;
      resetVideo();
      initVideo();
    });
  };

  const resetVideo = errored => {
    if (typeof $scope.socket === 'object' && typeof $scope.socket.disconnect === 'function') {
      $scope.socket.disconnect();

      $scope.socket = undefined;
    }

    if (typeof $scope.hls === 'object' && typeof $scope.hls.destroy === 'function') {
      $scope.hls.destroy();

      $scope.hls = undefined;
    } else {
      $scope.video.pause();

      $scope.video.removeAttribute('src');

      $scope.video.load();

      $scope.video.onerror = undefined;
    }

    $scope.video.controls = false;

    $scope.video.poster = errored === true ? $scope.config.errorPoster : $scope.config.readyPoster;
  };

  const videoError = err => {
    console.error({ type: 'Error', videoId: $scope.video.id, details: err });

    resetVideo(true);
  };

  const playVideo = async () => {
    try {
      await $scope.video.play();

      $scope.video.controls = true;
    } catch (err) {
      videoError(err);
    }
  };

  const initVideo = (type, source) => {
    // type can be hls, socket.io, mp4; resource is path
    switch (type) {
      case 'mp4':
        console.log('type', 'mp4');

        break;

      case 'socket.io':
        console.log('type', 'socket.io');

        // alert(source);

        // debugger;

        console.log(source.path, source.namespace);

        $scope.socket = io(source.namespace, {
          path: source.path,
          transports: [/* 'polling', */ 'websocket'],
          forceNew: true,
          timeout: 5000,
        });

        $scope.socket.on('connect', () => {
          console.log('connect');

          $scope.socket.on('greeting', data => {
            console.log('greeting from server', data);
          });

          $scope.socket.on('disconnect', () => {
            console.log('socket disconnect');
          });

          $scope.socket.emit('greeting', 'hello');
        });

        $scope.socket.on('connect_fail', data => {
          console.log('connect fail', data);
        });

        $scope.socket.on('connect_timeout', data => {
          console.log('connect timeout', data);
        });

        $scope.socket.on('reconnect_fail', data => {
          console.log('reconnect fail', data);
        });

        break;

      case 'hls':
        if (hasHlsJs() === true) {
          console.log({ type: 'Info', videoId: $scope.video.id, details: 'trying Hls.js' });

          $scope.hls = new Hls($scope.config.hlsJsConfig);

          $scope.hls.loadSource(source);

          $scope.hls.attachMedia($scope.video);

          // todo check config.autoplay
          $scope.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // console.log('manifest parsed');
            playVideo();
          });

          $scope.hls.on(Hls.Events.ERROR, (event, data) => {
            const { type, details, fatal } = data;
            if (fatal) {
              switch (type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.error({
                    type: 'Error',
                    videoId: $scope.video.id,
                    details,
                    // details: 'fatal network error encountered, try to recover',
                  });
                  $scope.hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.error({
                    type: 'Error',
                    videoId: $scope.video.id,
                    details,
                    // details: 'fatal media error encountered, try to recover',
                  });
                  $scope.hls.recoverMediaError();
                  break;
                case Hls.ErrorTypes.OTHER_ERROR:
                default:
                  videoError(data);
                  break;
              }
            }
          });
        } else if (hasHlsNative() === true) {
          console.log({ type: 'Info', videoId: $scope.video.id, details: 'trying Hls native' });

          $scope.video.onerror = () => {
            videoError($scope.video.error);
          };

          $scope.video.src = source;

          $scope.video.addEventListener('loadedmetadata', () => {
            // console.log('loadedmetadata');

            playVideo();
          });
        } else {
          videoError('Hls.js and Hls native video not supported');
        }

        break;
      default:
        console.log('do not init video');
        break;
    }
  };

  // function called by ng-init='init(${JSON.stringify(config)})'
  $scope.init = config => {
    $scope.config = config;

    $scope.video = document.getElementById(config.videoID);
  };

  $scope.$watch('msg', async (newVal, oldVal) => {
    // debugger;

    if (typeof newVal === 'undefined') {
      return;
    }

    // resets video player,
    // todo rename to destroyVideo ???
    resetVideo();

    // todo switch(msg.topic)...

    const { type, source } = extractVideoData(newVal.payload);

    try {
      /*
      todo: fix this ugly hack
      - handle lib race condition if hls.js not already cached in browser
      - Hls will initially be undefined when $scope.$watch('msg') is triggered
      - suspected lifecycle of node-red inserting script into head using default values,
      which results in script.async = true
      - condition can be easily illustrated when using private browsing mode
      in firefox and loading ui video player for first time
    */
      await waitForIt(() => typeof Hls === 'function', 10, 1000);
      //await waitForIt(() => typeof io === 'function', 10, 1000);
      initVideo(type, source);
    } catch (e) {
      videoError(e);
    }
  });

  $scope.$on('$destroy', () => {
    // console.log('destroyed');
    resetVideo();
  });
};
