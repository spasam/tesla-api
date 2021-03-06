import https from "https"
import {Observable} from "rxjs"
import {cdebug} from "./console"
import {STREAM_HOST} from "./constants"
import convertUnits from "convert-units"
import {newError} from "./errors"

export class Stream {
  static stream(vehicle) {
    this.instance = new Stream(vehicle)
    return this.instance.stream()
  }

  static stopStream() {
    this.instance.stopStream()
  }


  constructor(vehicle) {
    this.vehicle = vehicle
    this.tesla = vehicle.tesla
  }

  // returns Observable
  stream() {
    return new Observable(observer => {
      this._stream(observer)
    })
  }

  stopStream() {
    this.isAbort = true
    this.req.abort()
  }

  _stream(observer) {
    var {vehicleId, tokens} = this.vehicle
    var {email} = this.tesla
    var path = `/stream/${vehicleId}?values=speed,odometer,soc,elevation,est_heading,est_lat,est_lng,power,shift_state,range,est_range`
    cdebug("GET %s%s", STREAM_HOST, path)
    pd("GET streaming.vn.teslamotors.com")

    this.req = https.request({
      method: "GET",
      host: STREAM_HOST,
      path: path,
      auth: `${email}:${tokens[0]}`
    }, res => {
      if (res.statusCode === 200) {
        res.on("data", chunk => this.handleChunk(chunk, observer))
        res.on("end", () => this.handleEnd(res, observer))
      } else if (res.statusCode < 200 && res.statusCode >= 300) {
        return this.handleError(newError({status: res.statusCode, body: res.body}), observer)
      }
      res.on("error", err => this.handleError(err, observer))
    }).on("error", err => this.handleError(err, observer))
    this.req.end()
  }

  handleChunk = (chunk, observer) => {
    //cdebug("stream chunk %s", chunk)
    chunk.toString().split(/\r\n/).forEach(line => {
      if (line === "")
        return
      var parts = line.split(",")
      var data = {
        time: new Date(parseInt(parts[0])),
        speed: parts[1] === "" ? null : this.convertDistanceUnit(parseFloat(parts[1])),
        odometer: this.convertDistanceUnit(parseFloat(parts[2])),
        soc: parseFloat(parts[3]),
        elevation: parseFloat(parts[4]),
        estHeading: parseFloat(parts[5]),
        estLat: parseFloat(parts[6]),
        estLng: parseFloat(parts[7]),
        power: parseFloat(parts[8]),
        shiftState: parts[9] === "" ? null : parts[9],
        range: parseFloat(parts[10]),
        estRange: parseFloat(parts[11])
      }
      //cdebug("stream", data.shiftState)
      this.lastShiftState = data.shiftState
      observer.next(data)
    })
  };

  handleError = (err, observer) => {
    // TODO: refresh token
    //if (err.status === 401) {
    cdebug("stream error PASS", err)
    this._stream(observer)
  };

  handleEnd = (res, observer) => {
    if (this.lastShiftState === null || this.isAbort) {
      observer.complete()
      this.isAbort = false
    } else {
      this._stream(observer)
    }
  };

  convertDistanceUnit(value) {
    if (this.tesla.distanceUnit !== "km")
      return value
    return Math.floor(convertUnits(value).from("mi").to("km"))
  }
}
