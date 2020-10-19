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

      if ($scope.mediaSource instanceof MediaSource === true) {
        $scope.mediaSource.onsourceopen = undefined;

        if ($scope.sourceBuffer instanceof SourceBuffer === true) {
          $scope.sourceBuffer.onerror = undefined;

          $scope.sourceBuffer.onupdateend = undefined;

          if ($scope.sourceBuffer.updating === true) {
            $scope.sourceBuffer.abort();
          }

          $scope.mediaSource.removeSourceBuffer($scope.sourceBuffer);

          $scope.sourceBuffer = undefined;

          $scope.mediaSource = undefined;
        }
      }

      $scope.mime = undefined;

      $scope.lastSegment = undefined;

      $scope.lastTimestamp = undefined;

      $scope.lastSequence = undefined;

      $scope.lastDuration = undefined;

      // todo create destroy function
    }

    if (typeof $scope.hls === 'object' && typeof $scope.hls.destroy === 'function') {
      $scope.hls.destroy();

      $scope.hls = undefined;
    }

    $scope.video.pause();

    $scope.video.removeAttribute('src');

    $scope.video.load();

    $scope.video.onerror = undefined;

    $scope.video.onloadedmetadata = undefined;

    $scope.video.controls = false;

    $scope.video.poster = errored === true ? $scope.config.errorPoster : $scope.config.readyPoster;
  };

  const videoOnError = err => {
    console.error({ type: 'Error', videoId: $scope.video.id, details: err });

    resetVideo(true);
  };

  const playVideo = async () => {
    try {
      await $scope.video.play();

      $scope.video.controls = true;
    } catch (err) {
      videoOnError(err);
    }
  };

  const videoOnLoadedMetaData = async () => {
    await playVideo();
  };

  // 7th
  const socketOnSegment = segmentObject => {
    const { segment, duration, timestamp, sequence } = segmentObject;

    if (segment instanceof ArrayBuffer === false) {
      videoOnError(`typeof segment = ${typeof segment}`);

      return;
    }

    $scope.lastTimestamp = timestamp;

    $scope.lastSequence = sequence;

    $scope.lastDuration = duration;

    if ($scope.sourceBuffer.updating === true) {
      $scope.lastSegment = segment;

      return;
    }

    $scope.sourceBuffer.appendBuffer(segment);
  };

  // 6th
  const sourceBufferOnError = err => {
    videoOnError(err);
  };

  // 6th
  const sourceBufferOnUpdateEnd = () => {
    if ($scope.sourceBuffer.updating === true) {
      return;
    }

    if ($scope.lastSegment instanceof ArrayBuffer === true) {
      $scope.sourceBuffer.appendBuffer($scope.lastSegment);

      $scope.lastSegment = undefined;

      return;
    }

    const bufferedLength = $scope.sourceBuffer.buffered.length;

    if (bufferedLength === 0) {
      $scope.socket.emit('segment'); // request first available segment
      return;
    }

    const bufferedStart = $scope.sourceBuffer.buffered.start(0);

    const bufferedEnd = $scope.sourceBuffer.buffered.end(bufferedLength - 1);

    const bufferedDuration = bufferedEnd - bufferedStart;

    const maxDuration = Math.max(5, $scope.lastDuration * 2); // todo declare magic numbers

    if (bufferedDuration > maxDuration) {
      const newBufferedStart = bufferedStart + (bufferedDuration - maxDuration);

      $scope.sourceBuffer.remove(bufferedStart, newBufferedStart);

      return;
    }

    if ($scope.video.currentTime < bufferedStart) {
      $scope.video.currentTime = (bufferedEnd + bufferedStart) / 2;
    }

    $scope.socket.emit('segment', { timestamp: $scope.lastTimestamp }); // request newer segment
  };

  // 5th
  const socketOnInitialization = initialization => {
    if (initialization instanceof ArrayBuffer === false) {
      videoOnError(`typeof initialization = ${typeof initialization}`);
      return;
    }

    $scope.mediaSource.duration = Number.POSITIVE_INFINITY;

    $scope.sourceBuffer.appendBuffer(initialization);
  };

  // 4th
  const mediaSourceOnSourceOpen = () => {
    URL.revokeObjectURL($scope.video.src);

    $scope.sourceBuffer = $scope.mediaSource.addSourceBuffer($scope.mime);

    $scope.sourceBuffer.mode = 'sequence'; // or segments

    $scope.sourceBuffer.onerror = sourceBufferOnError;

    $scope.sourceBuffer.onupdateend = sourceBufferOnUpdateEnd;

    $scope.socket.emit('initialization');
  };

  // 3rd
  const socketOnMime = mime => {
    if (MediaSource.isTypeSupported(mime) === false) {
      videoOnError(`mime not supported: ${mime}`);

      return;
    }

    $scope.mime = mime;

    $scope.mediaSource = new MediaSource();

    $scope.mediaSource.onsourceopen = mediaSourceOnSourceOpen;

    $scope.video.src = URL.createObjectURL($scope.mediaSource);
  };

  // 2nd
  const socketOnConnect = () => {
    $scope.socket.emit('mime');
  };

  const initVideo = (type, source) => {
    // type can be hls, socket.io, mp4
    switch (type) {
      case 'mp4':
        console.log('type', 'mp4');

        break;

      case 'socket.io':
        // 1st

        if ('MediaSource' in window === false) {
          videoOnError('MediaSource not supported by browser');
          return;
        }

        $scope.socket = io(source.namespace, {
          path: source.path,
          transports: ['websocket', 'polling'],
          forceNew: true,
          timeout: 5000,
        });

        $scope.socket.on('connect', socketOnConnect);

        $scope.socket.on('mime', socketOnMime);

        $scope.socket.on('initialization', socketOnInitialization);

        $scope.socket.on('segment', socketOnSegment);

        $scope.video.onerror = videoOnError;

        $scope.video.onloadedmetadata = videoOnLoadedMetaData;

        // todo group all errors into 'source_error' with {type: ''}

        $scope.socket.on('source_error', err => {
          console.log('received source error from server', err);
        });

        $scope.socket.on('mp4frag_error', err => {
          console.log('received mp4frag error from server', err);
        });

        $scope.socket.on('mime_error', err => {
          console.log('received mime error from server', err);
        });

        $scope.socket.on('initialization_error', err => {
          console.log('received initializtion error from server', err);
        });

        $scope.socket.on('segment_error', err => {
          console.log('received segment error from server', err);
        });

        $scope.socket.on('disconnect', () => {
          console.log('socket disconnect');
        });

        $scope.socket.on('error', err => {
          console.log('received error from server', err);
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
          $scope.hls.on(Hls.Events.MANIFEST_PARSED, async () => {
            // console.log('manifest parsed');
            await playVideo();
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

          $scope.video.onerror = videoOnError;

          $scope.video.onloadedmetadata = videoOnLoadedMetaData;

          $scope.video.src = source;
        } else {
          videoOnError('Hls.js and Hls native video not supported');
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

      await waitForIt(() => typeof io === 'function', 10, 1000);

      initVideo(type, source);
    } catch (e) {
      videoOnError(e);
    }
  });

  $scope.$on('$destroy', () => {
    // console.log('destroyed');
    resetVideo();
  });
};
