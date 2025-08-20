
const MIDI_OFFSET = 21;
const AUDIO_SAMPLE_RATE = 22050;
const AUDIO_WINDOW_LENGTH = 2;

const FFT_HOP = 256;
const ANNOTATIONS_FPS = Math.floor(AUDIO_SAMPLE_RATE / FFT_HOP);

const ANNOT_N_FRAMES = ANNOTATIONS_FPS * AUDIO_WINDOW_LENGTH;
const AUDIO_N_SAMPLES = AUDIO_SAMPLE_RATE * AUDIO_WINDOW_LENGTH - FFT_HOP;

const WINDOW_OFFSET = (FFT_HOP / AUDIO_SAMPLE_RATE) * (ANNOT_N_FRAMES - AUDIO_N_SAMPLES / FFT_HOP) + 0.0018;

const MAX_FREQ_IDX = 87;
const CONTOURS_BINS_PER_SEMITONE = 3;
const ANNOTATIONS_BASE_FREQUENCY = 27.5;
const ANNOTATIONS_N_SEMITONES = 88;

const N_FREQ_BINS_CONTOURS = ANNOTATIONS_N_SEMITONES * CONTOURS_BINS_PER_SEMITONE;

/**
 * Evaluates the output of tensorflow pitch detection to note events
 */
export class PitchEvaluator {

  hzToMidi(hz) {
    return 12 * (Math.log2(hz) - Math.log2(440.0)) + 69;
  }

  midiToHz(midi) {
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0);
  }

  /**
   * convert the frame index to time in seconds
   *
   * @param frame
   * @returns the time in seconds
   */
  modelFrameToTime(frame) {
    return (frame * FFT_HOP) / AUDIO_SAMPLE_RATE - WINDOW_OFFSET * Math.floor(frame / ANNOT_N_FRAMES);
  }

  /**
   *
   * @param arr
   * @returns
   */
  argMax(arr) {
    return arr.length === 0
      ? null
      : arr.reduce(
        (maxIndex, currentValue, index) =>
          arr[maxIndex] > currentValue ? maxIndex : index,
        -1
      );
  }

  argMaxAxis1(arr) {
    return arr.map((row) => this.argMax(row));
  }

  whereGreaterThanAxis1(arr2d, threshold) {
    const outputX = [];
    const outputY = [];
    for (let i = 0; i < arr2d.length; i++) {
      for (let j = 0; j < arr2d[i].length; j++) {
        if (arr2d[i][j] > threshold) {
          outputX.push(i);
          outputY.push(j);
        }
      }
    }
    return [outputX, outputY];
  }

  meanStdDev(array) {
    const [sum, sumSquared, count] = array.reduce(
      (prev, row) => {
        const [rowSum, rowSumsSquared, rowCount] = row.reduce(
          (p, value) => [p[0] + value, p[1] + value * value, p[2] + 1],
          [0, 0, 0]
        );
        return [prev[0] + rowSum, prev[1] + rowSumsSquared, prev[2] + rowCount];
      },
      [0, 0, 0]
    );
    const mean = sum / count;
    const std = Math.sqrt((1 / (count - 1)) * (sumSquared - (sum * sum) / count));

    return [mean, std];
  }

  globalMax(array) {
    return array.reduce((prev, row) => Math.max(prev, ...row), 0);
  }

  min3dForAxis0(array) {
    const minArray = array[0].map((v) => v.slice());
    for (let x = 1; x < array.length; ++x) {
      for (let y = 0; y < array[0].length; ++y) {
        for (let z = 0; z < array[0][0].length; ++z) {
          minArray[y][z] = Math.min(minArray[y][z], array[x][y][z]);
        }
      }
    }
    return minArray;
  }

  argRelMax(array, order = 1) {
    const result = [];
    for (let col = 0; col < array[0].length; ++col) {
      for (let row = 0; row < array.length; ++row) {
        let isRelMax = true;
        for (
          let comparisonRow = Math.max(0, row - order);
          isRelMax && comparisonRow <= Math.min(array.length - 1, row + order);
          ++comparisonRow
        ) {
          if (comparisonRow !== row) {
            isRelMax = isRelMax && array[row][col] > array[comparisonRow][col];
          }
        }
        if (isRelMax) {
          result.push([row, col]);
        }
      }
    }
    return result;
  }

  max3dForAxis0(array) {
    const maxArray = array[0].map((v) => v.slice());
    for (let x = 1; x < array.length; ++x) {
      for (let y = 0; y < array[0].length; ++y) {
        for (let z = 0; z < array[0][0].length; ++z) {
          maxArray[y][z] = Math.max(maxArray[y][z], array[x][y][z]);
        }
      }
    }
    return maxArray;
  }

  isNotNull(t) {
    return t !== null;
  }

  constrainFrequency(onsets, frames, maxFreq, minFreq) {
    if (maxFreq) {
      const maxFreqIdx = this.hzToMidi(maxFreq) - MIDI_OFFSET;
      for (let i = 0; i < onsets.length; i++) {
        onsets[i].fill(0, maxFreqIdx);
      }
      for (let i = 0; i < frames.length; i++) {
        frames[i].fill(0, maxFreqIdx);
      }
    }

    if (minFreq) {
      const minFreqIdx = this.hzToMidi(minFreq) - MIDI_OFFSET;
      for (let i = 0; i < onsets.length; i++) {
        onsets[i].fill(0, 0, minFreqIdx);
      }
      for (let i = 0; i < frames.length; i++) {
        frames[i].fill(0, 0, minFreqIdx);
      }
    }
  }

  getInferredOnsets(onsets, frames, nDiff = 2) {

    const diffs = Array.from(Array(nDiff).keys())
      .map((n) => n + 1)
      .map((n) => {
        const framesAppended = Array(n)
          .fill(Array(frames[0].length).fill(0))
          .concat(frames);
        const nPlus = framesAppended.slice(n);
        const minusN = framesAppended.slice(0, -n);
        if (nPlus.length !== minusN.length) {
          throw new Error(
            `nPlus length !== minusN length: ${nPlus.length} !== ${minusN.length}`
          );
        }
        return nPlus.map((row, r) => row.map((v, c) => v - minusN[r][c]));
      });

    let frameDiff = this.min3dForAxis0(diffs);
    frameDiff = frameDiff.map((row) => row.map((v) => Math.max(v, 0)));
    frameDiff = frameDiff.map((row, r) => (r < nDiff ? row.fill(0) : row));

    const onsetMax = this.globalMax(onsets);
    const frameDiffMax = this.globalMax(frameDiff);

    frameDiff = frameDiff.map((row) =>
      row.map((v) => (onsetMax * v) / frameDiffMax)
    );

    return this.max3dForAxis0([onsets, frameDiff]);
  }


  /**
   * - Convert model outputs (per-frame pitch “frames” and “onsets” matrices) into a list of polyphonic note events with start frame, duration, MIDI pitch, and amplitude.
   * - Inputs:
   *     - frames: 2D array [timeFrames x pitchBins] with per-frame pitch activation/energy.
   *     - onsets: 2D array [timeFrames x pitchBins] with onset likelihoods.
   *
   * - Output: Array of note objects:
   *     - { startFrame, durationFrames, pitchMidi, amplitude }
   *
   * Step-by-step walkthrough:
   * 1. Determine frame threshold
   * - If config.frameThresh is null, compute it as mean + std of all values in frames (via meanStdDev). This
   *    auto-sets a “high energy” threshold adapted to the input.
   *
   * 2. Frequency range constraint
   * - constrainFrequency(onsets, frames, maxFreq, minFreq) zeroes out bins outside [minFreq, maxFreq] if provided.
   *    This limits detection to a desired pitch range.
   *
   * 3. Optional onset inference
   * - If config.inferOnsets is true, combine explicit onsets with frame differences to enhance onsets
   *    (getInferredOnsets). Otherwise use raw onsets.
   *
   * 4. Peak picking on onsets
   * - Build peakThresholdMatrix initialized to zeros.
   * - Find relative maxima along the time axis for each pitch bin (argRelMax); copy only those peak values
   *    into peakThresholdMatrix.
   * - From peakThresholdMatrix, select coordinates where value > config.onsetThresh (whereGreaterThanAxis1). These
   *    are candidate note starts and their pitch indices.
   * - Reverse order of detected starts so you process later notes first. This helps avoid reusing energy
   *    that should belong to later-found notes.
   *
   * 5. Greedy note growth per detected onset
   *
   * - Clone frames into remainingEnergy (so we can “consume” energy without altering original).
   * - For each candidate onset (noteStartIdx, freqIdx):
   *     - Skip if onset is at or beyond the last frame.
   *     - Walk forward from the start to find the end:
   *         - i moves forward; k counts consecutive frames below the frame energy threshold inferredFrameThresh.
   *         - Stop when either you reach the end or you have k == energyTolerance consecutive low-energy frames.
   *         - Back up by k (i -= k) so short gaps don’t prematurely end the note.
   *
   *     - If the note is too short (duration <= minNoteLen), discard it.
   *     - Otherwise, zero out remainingEnergy for the note’s pitch band over its duration, also zeroing immediate
   *        neighbors [freqIdx-1, freqIdx, freqIdx+1] to avoid duplicate notes overlapping in nearby bins.
   *     - Compute amplitude as mean frame energy for that pitch across the note duration.
   *     - Emit the note: startFrame, durationFrames, pitchMidi (freqIdx + MIDI_OFFSET), amplitude.
   *
   * 6. Optional “Melodia trick” (config.melodiaTrick)
   *
   * - While the global maximum in remainingEnergy is still above inferredFrameThresh:
   *     - Find the single largest cell (iMid, freqIdx).
   *     - Zero that cell, then grow the note forward and backward similarly to step 5 using the energyTolerance rule,
   *        zeroing [freqIdx-1, freqIdx, freqIdx+1] as you go to “consume” that ridge.
   *     - Compute iStart and iEnd with gap compensation; sanity check bounds.
   *     - Compute amplitude as mean energy for that segment; skip if too short (<= minNoteLen).
   *     - Push another note event.
   *
   * - This pass recovers additional notes that weren’t initiated by onset peaks, which is useful when onsets are
   *    weak or missing.
   *
   * 7. Return the list of note events.
   *
   * Key concepts and parameters:
   * - frames vs onsets:
   *     - frames: sustained energy per pitch over time.
   *     - onsets: transient likelihood of note starts.
   *
   * - onsetThresh: how strong an onset peak must be to seed a note.
   * - frameThresh: energy threshold used when growing/stopping a note. If null, derived as mean + std of frames.
   * - energyTolerance: how many consecutive sub-threshold frames are tolerated before deciding a note has
   *    ended (prevents brief dips from splitting notes).
   * - minNoteLen: minimum duration (in frames) required to accept a note.
   * - melodiaTrick: a follow-up greedy pass that “tracks” peaks in the remaining energy even without onsets,
   *    to capture missed notes.
   * - Pitch indexing:
   *     - freqIdx is a bin index; pitchMidi = freqIdx + MIDI_OFFSET (MIDI_OFFSET often corresponds to A0=21).
   *     - MAX_FREQ_IDX is the top valid bin; neighbors are clamped at edges.
   *
   * - Amplitude: average energy of frames within the note segment at the note’s pitch bin.
   *
   * Why reverse the note starts?
   * - Processing later-onset notes first helps reserve energy for those, reducing the chance earlier processing
   *    will zero out energy needed for later detections.
   *
   * Mutation and safety notes:
   * - The function intentionally mutates a copy (remainingEnergy) when “consuming” energy, leaving original frames intact.
   * - It does mutate original onsets/frames inside constrainFrequency if min/maxFreq are set. If you need to
   *    preserve originals, pass in copies before calling.
   *
   * Complexity (roughly):
   * - Peak picking: O(T*P) where T = number of frames, P = pitch bins.
   * - Note building: worst-case O(N*T) across candidates, but early stopping and energy consumption reduce repeated work.
   * - Melodia trick: Each iteration consumes and zeros a ridge; the number of iterations is bounded by the number
   *    of strong peaks. Practical cost remains manageable for typical frame/pitch sizes.
   *
   * @param {*} frames as returned from BasicPitch
   * @param {*} onsets as returned from BasicPitch
   * @param {*} config.onsetThresh how strong an onset peak must be to seed a note.
   * @param {*} config.frameThresh energy threshold used when growing/stopping a note. If null, derived as mean + std of frames.
   * @param {*} config.minNoteLen minimum duration (in frames) required to accept a note.
   * @param {*} config.inferOnsets combine explicit onsets with frame differences to enhance onsets (getInferredOnsets). Otherwise, use raw onsets.
   * @param {*} config.maxFreq
   * @param {*} config.minFreq
   * @param {*} config.melodiaTrick a follow-up greedy pass that “tracks” peaks in the remaining energy even without onsets, to capture missed notes.
   * @param {*} config.energyTolerance how many consecutive sub-threshold frames are tolerated before deciding a note has ended (prevents brief dips from splitting notes).
   *
   * @returns an array of note events objects
   *
   */
  outputToNotesPoly(frames, onsets, config) {

    /**
     default values:
     onsetThresh = 0.5,
     frameThresh = 0.3,
     minNoteLen = 5,
     inferOnsets = true,
     maxFreq = null,
     minFreq = null,
     melodiaTrick = true,
     energyTolerance = 11
     */

    let inferredFrameThresh = config.frameThresh;
    if (inferredFrameThresh === null) {
      const [mean, std] = this.meanStdDev(frames);
      inferredFrameThresh = mean + std;
    }

    const nFrames = frames.length;
    this.constrainFrequency(onsets, frames, config.maxFreq, config.minFreq);

    let inferredOnsets = onsets;
    if (config.inferOnsets) {
      inferredOnsets = this.getInferredOnsets(onsets, frames);
    }

    const peakThresholdMatrix = inferredOnsets.map((o) => o.map(() => 0));
    this.argRelMax(inferredOnsets).forEach(([row, col]) => {
      peakThresholdMatrix[row][col] = inferredOnsets[row][col];
    });

    const [noteStarts, freqIdxs] = this.whereGreaterThanAxis1(
      peakThresholdMatrix,
      config.onsetThresh
    );

    noteStarts.reverse();
    freqIdxs.reverse();

    const remainingEnergy = frames.map((frame) => frame.slice());

    const noteEvents = noteStarts
      .map((noteStartIdx, idx) => {

        const freqIdx = freqIdxs[idx];

        if (noteStartIdx >= nFrames - 1) {
          return null;
        }

        let i = noteStartIdx + 1;
        let k = 0;

        while (i < nFrames - 1 && k < config.energyTolerance) {

          if (remainingEnergy[i][freqIdx] < inferredFrameThresh) {
            k += 1;
          } else {
            k = 0;
          }
          i += 1;
        } // end while

        i -= k;
        if (i - noteStartIdx <= config.minNoteLen) {
          return null;
        }

        for (let j = noteStartIdx; j < i; ++j) {
          remainingEnergy[j][freqIdx] = 0;
          if (freqIdx < MAX_FREQ_IDX) {
            remainingEnergy[j][freqIdx + 1] = 0;
          }
          if (freqIdx > 0) {
            remainingEnergy[j][freqIdx - 1] = 0;
          }
        }

        const amplitude =
          frames
            .slice(noteStartIdx, i)
            .reduce((prev, row) => prev + row[freqIdx], 0) /
          (i - noteStartIdx);

        return {
          startFrame: noteStartIdx,
          durationFrames: i - noteStartIdx,
          pitchMidi: freqIdx + MIDI_OFFSET,
          amplitude: amplitude,
        };

      })
      .filter(this.isNotNull);


    if (config.melodiaTrick === true) {

      while (this.globalMax(remainingEnergy) > inferredFrameThresh) {
        const [iMid, freqIdx] = remainingEnergy.reduce(
          (prevCoord, currRow, rowIdx) => {
            const colMaxIdx = this.argMax(currRow);
            return currRow[colMaxIdx] >
            remainingEnergy[prevCoord[0]][prevCoord[1]]
              ? [rowIdx, colMaxIdx]
              : prevCoord;
          },
          [0, 0]
        );

        remainingEnergy[iMid][freqIdx] = 0;
        let i = iMid + 1;
        let k = 0;

        while (i < nFrames - 1 && k < config.energyTolerance) {
          if (remainingEnergy[i][freqIdx] < inferredFrameThresh) {
            k += 1;
          } else {
            k = 0;
          }
          remainingEnergy[i][freqIdx] = 0;
          if (freqIdx < MAX_FREQ_IDX) {
            remainingEnergy[i][freqIdx + 1] = 0;
          }
          if (freqIdx > 0) {
            remainingEnergy[i][freqIdx - 1] = 0;
          }
          i += 1;
        } // end while

        const iEnd = i - 1 - k;
        i = iMid - 1;
        k = 0;
        while (i > 0 && k < config.energyTolerance) {

          if (remainingEnergy[i][freqIdx] < inferredFrameThresh) {
            k += 1;
          } else {
            k = 0;
          }

          remainingEnergy[i][freqIdx] = 0;
          if (freqIdx < MAX_FREQ_IDX) {
            remainingEnergy[i][freqIdx + 1] = 0;
          }
          if (freqIdx > 0) {
            remainingEnergy[i][freqIdx - 1] = 0;
          }
          i -= 1;
        }

        const iStart = i + 1 + k;
        if (iStart < 0) {
          throw new Error(`iStart is not positive! value: ${iStart}`);
        }

        if (iEnd >= nFrames) {
          throw new Error(
            `iEnd is past end of times. (iEnd, times.length): (${iEnd}, ${nFrames})`
          );
        }

        const amplitude =
          frames.slice(iStart, iEnd).reduce((sum, row) => sum + row[freqIdx], 0) /
          (iEnd - iStart);

        if (iEnd - iStart <= config.minNoteLen)
          continue;

        noteEvents.push({
          startFrame: iStart,
          durationFrames: iEnd - iStart,
          pitchMidi: freqIdx + MIDI_OFFSET,
          amplitude: amplitude,
        });

      }
    }
    return noteEvents;
  }

  /**
   * Create gaussian distribution with mean and standard deviation
   *
   * @param {*} M
   * @param {*} std
   *
   * @returns an array of a gaussian distribution
   */
  gaussian(M, std) {
    return Array.from(Array(M).keys()).map((n) =>
      Math.exp((-1 * (n - (M - 1) / 2) ** 2) / (2 * std ** 2))
    );
  }

  /**
   *
   * @param {*} pitchMidi number of the midi pitch
   *
   * @returns
   */
  midiPitchToContourBin(pitchMidi) {
    return 12.0 * CONTOURS_BINS_PER_SEMITONE * Math.log2(this.midiToHz(pitchMidi) / ANNOTATIONS_BASE_FREQUENCY);
  }

  /**
   *
   * @param {*} contours the contours returned by the Basic Pitch detection
   * @param {*} notes the note events
   * @param {*} nBinsTolerance ?
   *
   * @returns
   */
  addPitchBendsToNoteEvents(
    contours,
    notes,
    nBinsTolerance = 25
  ) {
    const windowLength = nBinsTolerance * 2 + 1;
    const freqGaussian = this.gaussian(windowLength, 5);

    return notes.map((note) => {

      const freqIdx = Math.floor(
        Math.round(this.midiPitchToContourBin(note.pitchMidi))
      );

      const freqStartIdx = Math.max(freqIdx - nBinsTolerance, 0);
      const freqEndIdx = Math.min(
        N_FREQ_BINS_CONTOURS,
        freqIdx + nBinsTolerance + 1
      );

      const freqGuassianSubMatrix = freqGaussian.slice(
        Math.max(0, nBinsTolerance - freqIdx),
        windowLength -
        Math.max(0, freqIdx - (N_FREQ_BINS_CONTOURS - nBinsTolerance - 1))
      );

      const pitchBendSubmatrix = contours
        .slice(note.startFrame, note.startFrame + note.durationFrames)
        .map((d) =>
          d.slice(freqStartIdx, freqEndIdx).map((v, col) => v * freqGuassianSubMatrix[col])
        );

      const pbShift = nBinsTolerance - Math.max(0, nBinsTolerance - freqIdx);
      const bends = this.argMaxAxis1(pitchBendSubmatrix).map((v) => v - pbShift);

      return Object.assign(Object.assign({}, note), {pitchBends: bends});
    });
  }

  /**
   * Convert the frame indices of the start frame and the duration frames to time in seconds
   *
   * @param {*} notes
   *
   * @returns an array of timed note events
   */
  noteFramesToTime = (notes) =>
    notes.map((note) => {
      return {
        pitchMidi: note.pitchMidi,
        amplitude: note.amplitude,
        pitchBends: note.pitchBends,
        startTimeSeconds: this.modelFrameToTime(note.startFrame),
        durationSeconds: this.modelFrameToTime(note.startFrame + note.durationFrames) - this.modelFrameToTime(note.startFrame),
      };
    });

}
