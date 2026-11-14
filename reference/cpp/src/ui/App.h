#pragma once
// The application shell: a stack of screens on top of FTXUI.
//
// Each Screen renders itself and handles its own input. Overlay screens
// (dialogs) are drawn on top of whatever is beneath them. Stack changes are
// deferred until the current event finishes, so a screen can safely close
// itself from inside its own handler.

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include <ftxui/component/event.hpp>
#include <ftxui/component/screen_interactive.hpp>
#include <ftxui/dom/elements.hpp>

#include "strategy/GameState.h"

namespace vamps {

class App;

class Screen {
public:
    virtual ~Screen() = default;
    virtual ftxui::Element render(App& app) = 0;
    virtual bool onEvent(App& app, ftxui::Event e) = 0;
    virtual void onTick(App& app, double seconds) {}
    virtual bool isOverlay() const { return false; }
};

class App {
public:
    explicit App(ftxui::ScreenInteractive& screen);
    void start(std::unique_ptr<Screen> first) { stack_.push_back(std::move(first)); }

    ftxui::Element render();
    bool onEvent(ftxui::Event e);
    void tick(double seconds);

    // Screen stack (deferred).
    void push(std::unique_ptr<Screen> s);
    void pop();
    void popAll();                         // back to an empty stack
    void replaceTop(std::unique_ptr<Screen> s);
    void quit();

    // Convenience dialogs.
    void message(const std::string& title, const std::string& text);
    void error(const std::string& text) { message("Cannot Do That", text); }

    // The campaign in progress (null on the main menu).
    std::unique_ptr<GameState> game;

    // Terminal size in cells.
    int width() const;
    int height() const;

private:
    void applyPending();

    ftxui::ScreenInteractive& screen_;
    std::vector<std::unique_ptr<Screen>> stack_;
    std::vector<std::function<void()>> pending_;
};

} // namespace vamps
