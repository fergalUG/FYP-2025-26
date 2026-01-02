import ExpoModulesCore
import CoreMotion

public class VehicleMotionModule: Module {
  private let motionManager = CMMotionManager()
  
  public func definition() -> ModuleDefinition {
    Name("VehicleMotion")

    Events("onMotionUpdate")

    Function("startTracking") {
      if motionManager.isDeviceMotionAvailable {
        motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
        
        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] (data, error) in
          guard let data = data else { return }
          
          let accel = data.userAcceleration
          
          self?.sendEvent("onMotionUpdate", [
            "x": accel.x,
            "y": accel.y,
            "z": accel.z,
            "pitch": data.attitude.pitch,
            "roll": data.attitude.roll
          ])
        }
      }
    }

    Function("stopTracking") {
      motionManager.stopDeviceMotionUpdates()
    }
  }
}