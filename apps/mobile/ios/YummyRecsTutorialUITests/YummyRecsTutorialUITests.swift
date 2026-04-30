import XCTest

private struct TutorialFlow: Decodable {
  let id: String
  let name: String?
  let outputName: String?
  let initialDelayMs: Int?
  let steps: [TutorialStep]
}

private struct TutorialStep: Decodable {
  let type: String
  let id: String?
  let x: Double?
  let y: Double?
  let startX: Double?
  let startY: Double?
  let endX: Double?
  let endY: Double?
  let ms: Int?
  let holdMs: Int?
  let durationMs: Int?
  let timeoutMs: Int?
  let text: String?
  let key: String?
  let note: String?
}

private struct TutorialEvent: Encodable {
  let type: String
  let stepIndex: Int
  let timeMs: Int
  let durationMs: Int?
  let x: Double?
  let y: Double?
  let startX: Double?
  let startY: Double?
  let endX: Double?
  let endY: Double?
  let id: String?
  let note: String?
}

final class YummyRecsTutorialUITests: XCTestCase {
  private var events: [TutorialEvent] = []
  private var recordingEpochMs: Double = 0

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testRunTutorialFlow() throws {
    let environment = ProcessInfo.processInfo.environment
    let flowPath = try requiredEnvironmentValue("TUTORIAL_FLOW_PATH", environment: environment)
    let eventsPath = try requiredEnvironmentValue("TUTORIAL_EVENTS_PATH", environment: environment)
    let appBundleId = environment["TUTORIAL_APP_BUNDLE_ID"] ?? "com.yummyrecs.mobile"
    recordingEpochMs = Double(environment["TUTORIAL_RECORDING_STARTED_AT_MS"] ?? "") ?? currentEpochMs()

    let flowData = try Data(contentsOf: URL(fileURLWithPath: flowPath))
    let flow = try JSONDecoder().decode(TutorialFlow.self, from: flowData)
    let app = XCUIApplication(bundleIdentifier: appBundleId)
    app.launchEnvironment["TUTORIAL_FLOW_ID"] = flow.id
    app.launch()

    wait(milliseconds: environment["TUTORIAL_INITIAL_DELAY_MS"].flatMap(Int.init) ?? flow.initialDelayMs ?? 1200)

    for (index, step) in flow.steps.enumerated() {
      try execute(step: step, stepIndex: index, app: app)
      if let holdMs = step.holdMs {
        wait(milliseconds: holdMs)
      }
    }

    try writeEvents(to: eventsPath, flow: flow)
  }

  private func execute(step: TutorialStep, stepIndex: Int, app: XCUIApplication) throws {
    switch step.type {
    case "wait":
      wait(milliseconds: step.ms ?? 0)
    case "tapElement":
      let id = try requiredStepValue(step.id, stepIndex: stepIndex, name: "id")
      let element = try waitForElement(id: id, timeoutMs: step.timeoutMs ?? 8000, app: app, stepIndex: stepIndex)
      let normalizedPoint = normalizedCenter(of: element, in: app)
      let eventTimeMs = relativeTimeMs()
      element.tap()
      events.append(
        TutorialEvent(
          type: "tap",
          stepIndex: stepIndex,
          timeMs: eventTimeMs,
          durationMs: 450,
          x: normalizedPoint.x,
          y: normalizedPoint.y,
          startX: nil,
          startY: nil,
          endX: nil,
          endY: nil,
          id: id,
          note: step.note
        )
      )
    case "tapPoint":
      let point = try normalizedPoint(x: step.x, y: step.y, stepIndex: stepIndex)
      let eventTimeMs = relativeTimeMs()
      app.coordinate(withNormalizedOffset: CGVector(dx: point.x, dy: point.y)).tap()
      events.append(
        TutorialEvent(
          type: "tap",
          stepIndex: stepIndex,
          timeMs: eventTimeMs,
          durationMs: 450,
          x: point.x,
          y: point.y,
          startX: nil,
          startY: nil,
          endX: nil,
          endY: nil,
          id: step.id,
          note: step.note
        )
      )
    case "swipe":
      let startPoint = try normalizedPoint(x: step.startX, y: step.startY, stepIndex: stepIndex)
      let endPoint = try normalizedPoint(x: step.endX, y: step.endY, stepIndex: stepIndex)
      let durationMs = step.durationMs ?? 500
      let eventTimeMs = relativeTimeMs()
      let startCoordinate = app.coordinate(withNormalizedOffset: CGVector(dx: startPoint.x, dy: startPoint.y))
      let endCoordinate = app.coordinate(withNormalizedOffset: CGVector(dx: endPoint.x, dy: endPoint.y))
      startCoordinate.press(forDuration: Double(durationMs) / 1000.0, thenDragTo: endCoordinate)
      events.append(
        TutorialEvent(
          type: "swipe",
          stepIndex: stepIndex,
          timeMs: eventTimeMs,
          durationMs: durationMs,
          x: nil,
          y: nil,
          startX: startPoint.x,
          startY: startPoint.y,
          endX: endPoint.x,
          endY: endPoint.y,
          id: step.id,
          note: step.note
        )
      )
    case "typeText":
      app.typeText(step.text ?? "")
    case "pressKey":
      try press(key: step.key, app: app, stepIndex: stepIndex)
    case "assertElement":
      let id = try requiredStepValue(step.id, stepIndex: stepIndex, name: "id")
      _ = try waitForElement(id: id, timeoutMs: step.timeoutMs ?? 8000, app: app, stepIndex: stepIndex)
    default:
      throw tutorialFailure("Unsupported step type \"\(step.type)\" at step \(stepIndex).")
    }
  }

  private func waitForElement(
    id: String,
    timeoutMs: Int,
    app: XCUIApplication,
    stepIndex: Int
  ) throws -> XCUIElement {
    let element = app.descendants(matching: .any)[id]
    if !element.waitForExistence(timeout: Double(timeoutMs) / 1000.0) {
      throw tutorialFailure("Could not find element \"\(id)\" at step \(stepIndex) within \(timeoutMs)ms.")
    }
    return element
  }

  private func normalizedCenter(of element: XCUIElement, in app: XCUIApplication) -> (x: Double, y: Double) {
    let appFrame = app.frame
    let elementFrame = element.frame
    let x = (elementFrame.midX - appFrame.minX) / max(appFrame.width, 1)
    let y = (elementFrame.midY - appFrame.minY) / max(appFrame.height, 1)
    return (clamp(Double(x)), clamp(Double(y)))
  }

  private func normalizedPoint(x: Double?, y: Double?, stepIndex: Int) throws -> (x: Double, y: Double) {
    let resolvedX = try requiredStepValue(x, stepIndex: stepIndex, name: "x")
    let resolvedY = try requiredStepValue(y, stepIndex: stepIndex, name: "y")
    guard (0...1).contains(resolvedX), (0...1).contains(resolvedY) else {
      throw tutorialFailure("Coordinates at step \(stepIndex) must be normalized values between 0 and 1.")
    }
    return (resolvedX, resolvedY)
  }

  private func press(key: String?, app: XCUIApplication, stepIndex: Int) throws {
    let normalizedKey = (key ?? "").lowercased()
    switch normalizedKey {
    case "return", "enter":
      app.typeText("\n")
    case "delete", "backspace":
      let deleteKey = app.keys["delete"]
      if deleteKey.exists {
        deleteKey.tap()
      } else {
        app.typeText("\u{8}")
      }
    case "escape":
      XCUIDevice.shared.press(.home)
      app.activate()
    default:
      throw tutorialFailure("Unsupported key \"\(normalizedKey)\" at step \(stepIndex).")
    }
  }

  private func writeEvents(to path: String, flow: TutorialFlow) throws {
    let payload: [String: Any] = [
      "flowId": flow.id,
      "flowName": flow.name ?? flow.id,
      "outputName": flow.outputName ?? flow.id,
      "recordingEpochMs": recordingEpochMs,
      "events": try JSONSerialization.jsonObject(with: JSONEncoder().encode(events), options: []),
    ]
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: URL(fileURLWithPath: path))
  }

  private func requiredEnvironmentValue(_ key: String, environment: [String: String]) throws -> String {
    guard let value = environment[key], !value.isEmpty else {
      throw tutorialFailure("Missing required environment variable \(key).")
    }
    return value
  }

  private func requiredStepValue<T>(_ value: T?, stepIndex: Int, name: String) throws -> T {
    guard let value else {
      throw tutorialFailure("Missing \(name) for step \(stepIndex).")
    }
    return value
  }

  private func relativeTimeMs() -> Int {
    max(0, Int(currentEpochMs() - recordingEpochMs))
  }

  private func currentEpochMs() -> Double {
    Date().timeIntervalSince1970 * 1000
  }

  private func wait(milliseconds: Int) {
    if milliseconds > 0 {
      Thread.sleep(forTimeInterval: Double(milliseconds) / 1000.0)
    }
  }

  private func clamp(_ value: Double) -> Double {
    min(1, max(0, value))
  }

  private func tutorialFailure(_ message: String) -> Error {
    NSError(domain: "YummyRecsTutorialUITests", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
