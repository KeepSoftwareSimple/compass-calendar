import CompassKit
import XCTest
@testable import CompassData

@MainActor
final class QuickAddDraftIsolationTests: XCTestCase {
    func testCancellingQuickAddPreservesAnUnsavedMainForm() async throws {
        let model = try await makeModel()
        model.createTimedDraft(activity: .createShortcut)
        model.setDraftTitle("Keep this draft")
        let draft = try XCTUnwrap(model.draftStore.gridDraft)
        let baseline = model.draftStore.formBaseline
        let status = model.draftStore.status
        model.beginQuickAddPanelSession()
        model.syncQuickAddQuery("Panel event")
        model.cancelQuickAddPanelSession()
        XCTAssertEqual(model.draftStore.gridDraft, draft)
        XCTAssertEqual(model.draftStore.formBaseline, baseline)
        XCTAssertEqual(model.draftStore.status, status)
    }

    func testSavingQuickAddPreservesTheMainFormAndCreatesAnUndoableEvent() async throws {
        let model = try await makeModel()
        model.createTimedDraft(activity: .createShortcut)
        model.setDraftTitle("Keep editing")
        let draft = model.draftStore.gridDraft
        let baseline = model.draftStore.formBaseline
        model.beginQuickAddPanelSession()
        let saved = await model.saveQuickAddFromPanel(submitTitle: "Panel event")
        XCTAssertTrue(saved)
        XCTAssertEqual(model.draftStore.gridDraft, draft)
        XCTAssertEqual(model.draftStore.formBaseline, baseline)
        XCTAssertTrue(model.isEventFormVisible)
        XCTAssertTrue(model.loadedEvents.contains { EventTitleSearch.eventTitle($0) == "Panel event" })
        XCTAssertTrue(model.undoStore.canUndo)
        await model.undoLastChangeAndWait()
        XCTAssertFalse(model.loadedEvents.contains { EventTitleSearch.eventTitle($0) == "Panel event" })
        XCTAssertEqual(model.draftStore.gridDraft, draft)
    }

    func testMainQuickTimeBufferAndPlacementSurvivePanelCancellation() async throws {
        let model = try await makeModel()
        model.createTimedDraft(activity: .keyboardPlace)
        model.setDraftTitle("Placed draft")
        model.draftStore.setQuickTimeDigits("930")
        let draft = model.draftStore.gridDraft
        let status = model.draftStore.status
        model.beginQuickAddPanelSession()
        model.syncQuickAddQuery("1130")
        XCTAssertEqual(model.quickAddTimeDigits, "1130")
        XCTAssertEqual(model.draftStore.quickTimeDigits, "930")
        model.cancelQuickAddPanelSession()
        XCTAssertEqual(model.draftStore.gridDraft, draft)
        XCTAssertEqual(model.draftStore.status, status)
        XCTAssertEqual(model.draftStore.quickTimeDigits, "930")
    }

    func testTimeOnlyPanelInputCreatesTheChosenTimeWithoutUsingItAsTheTitle() async throws {
        let model = try await makeModel()
        model.beginQuickAddPanelSession()
        let saved = await model.saveQuickAddFromPanel(submitTitle: "1130")
        XCTAssertTrue(saved)
        let event = try XCTUnwrap(model.loadedEvents.first { EventTitleSearch.eventTitle($0) == "Untitled event" })
        guard case .timed(let timed) = event.schedule else { return XCTFail("Expected timed event") }
        let start = try XCTUnwrap(CompassDateParsing.parseInEffectiveTimeZone(timed.start.rawValue))
        XCTAssertEqual(EffectiveTimeZone.calendar.component(.hour, from: start), 11)
        XCTAssertEqual(EffectiveTimeZone.calendar.component(.minute, from: start), 30)
        XCTAssertNil(model.draftStore.gridDraft)
    }

    func testEmptyAndInvalidTimeSubmissionsStayInThePanel() async throws {
        let model = try await makeModel()
        let before = model.loadedEvents
        model.beginQuickAddPanelSession()
        let empty = await model.saveQuickAddFromPanel(submitTitle: " ")
        XCTAssertFalse(empty)
        XCTAssertNotNil(model.quickAddError)
        let invalid = await model.saveQuickAddFromPanel(submitTitle: "2599")
        XCTAssertFalse(invalid)
        XCTAssertNotNil(model.quickAddError)
        XCTAssertNotNil(model.quickAddPanelSession)
        XCTAssertEqual(model.loadedEvents, before)
        let corrected = await model.saveQuickAddFromPanel(submitTitle: "1430")
        XCTAssertTrue(corrected)
        XCTAssertNil(model.quickAddError)
    }

    func testPanelCanCreateFromLifeWithoutChangingTheMainView() async throws {
        let model = try await makeModel()
        model.viewStore.view = .life
        model.beginQuickAddPanelSession()
        let saved = await model.saveQuickAddFromPanel(submitTitle: "From Life")
        XCTAssertTrue(saved)
        XCTAssertEqual(model.viewStore.view, .life)
        XCTAssertTrue(model.loadedEvents.contains { EventTitleSearch.eventTitle($0) == "From Life" })
    }

    func testRepeatedPresentationDoesNotErasePanelInput() async throws {
        let model = try await makeModel()
        model.beginQuickAddPanelSession()
        model.syncQuickAddQuery("1130")
        let id = model.quickAddPanelSession?.id
        model.beginQuickAddPanelSession()
        XCTAssertEqual(model.quickAddPanelSession?.id, id)
        XCTAssertEqual(model.quickAddTimeDigits, "1130")
    }

    func testSessionChangePreventsSubmittingAnOldPanel() async throws {
        let model = try await makeModel()
        model.beginQuickAddPanelSession()
        model.syncQuickAddQuery("Old account input")
        await model.authStore.handleSessionExpired()
        XCTAssertNil(model.quickAddPanelSession)
        let saved = await model.saveQuickAddFromPanel(submitTitle: "Old account input")
        XCTAssertFalse(saved)
        XCTAssertFalse(model.loadedEvents.contains { EventTitleSearch.eventTitle($0) == "Old account input" })
    }

    private func makeModel() async throws -> NativeCalendarRootModel {
        let previous = EffectiveTimeZone.identifier
        let environment = try NativeCalendarEnvironment(appURL: URL(string: "https://compass.invalid")!,
            inMemoryDatabase: true, sessionStore: MemorySessionStore(tokens: nil))
        let model = NativeCalendarRootModel(environment: environment, demoPresentation: try DemoSeedFixture.load())
        addTeardownBlock { EffectiveTimeZone.identifier = previous }
        await model.start()
        return model
    }
}
