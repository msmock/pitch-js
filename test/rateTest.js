
import fs from 'fs';
import { AudioContext } from 'web-audio-api';
// import { AudioBuffer } from 'web-audio-api';

import pkg from '@alexanderolsen/libsamplerate-js';
import { kMaxLength } from 'buffer';
const { create, ConverterType } = pkg;

/**
 *
 */
async function sampleRateConversion() {

  // the auido file to pitch
  const fileToPitch = process.cwd() + '/test/test-input/my-recording.wav';
  const clip = fs.readFileSync(fileToPitch);

  // decode the audio clip data. keeps the sample rate. 
  const audioCtx = new AudioContext();
  audioCtx.decodeAudioData(clip, onsuccess, onerror);

  function onerror() {
    console.log("Error during audio decoding.");
  }

  function onsuccess(audioBuffer) {
    if (audioBuffer.sampleRate != 22050) {
      convert(audioBuffer);
    } else {
      console.log('we are fine and can run the ptch detection');
    }
  };

  /**
   * @param {*} audioBuffer an AudioBuffer object
   */
  function convert(audioBuffer) {

    console.log('resample audio with sample rate ' + audioBuffer.sampleRate + ', buffer length ' + audioBuffer.length +
      ', duration ' + audioBuffer.duration + ' and ' + audioBuffer.numberOfChannels + ' channel.');

    let converterType = ConverterType.SRC_SINC_BEST_QUALITY;
    let nChannels = 1;
    let inputSampleRate = 44100;
    let outputSampleRate = 22050;

    create(nChannels, inputSampleRate, outputSampleRate, {
      converterType: converterType, // default SRC_SINC_FASTEST. see API for more
    }).then((src) => {

      let resampled = src.simple(audioBuffer);
      src.destroy(); // clean up

      // interlude test 
      // createBuffer(numOfChannels, length, sampleRate)
      let myArrayBuffer = audioCtx.createBuffer(
        1,
        22050 * 3, // 3 sekunden dauer
        22050,
      );

      for (let channel = 0; channel < myArrayBuffer.numberOfChannels; channel++) {
        // This gives us the actual array that contains the data
        const nowBuffering = myArrayBuffer.getChannelData(channel);
        for (let i = 0; i < myArrayBuffer.length; i++) {
          nowBuffering[i] = Math.random() * 2 - 1;
        }
      }

      console.log("My array buffer sample rate " + myArrayBuffer.sampleRate);
      console.log("My array buffer duration " + myArrayBuffer.duration);
      console.log("My array buffer length " + myArrayBuffer.length);
      console.log("My array buffer channel count " + myArrayBuffer.numberOfChannels);

      // end test 

      // audioCtx.decodeAudioData(resampled, onsuccess, onerror);

      function onerror(e) {
        console.log("Error during audio decoding. Cause: " + e);
      }

      // function onsuccess(audioBuffer) {
      console.log('resampled audio to sample rate ' + resampled.sampleRate + ', buffer length ' + resampled.length +
        ', duration ' + resampled.duration + ' and ' + resampled.numberOfChannels + ' channel.');
      analyze(resampled);
      // };

    });
  };

  function analyze(audioBuffer) {

    console.log('analyze audio with buffer length ' + audioBuffer.length +
      ', duration ' + audioBuffer.duration + ' and ' + audioBuffer.numberOfChannels + ' channel.');

  }


}

// run the test
sampleRateConversion();
