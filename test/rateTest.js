
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
      converterType: converterType,
    }).then((src) => {

      let resampled = src.simple(audioBuffer);
      src.destroy(); // clean up

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
