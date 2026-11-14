#include "ui/App.h"

#include <ftxui/screen/terminal.hpp>

#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

App::App(ScreenInteractive& screen) : screen_(screen) {}

int App::width() const { return Terminal::Size().dimx; }
int App::height() const { return Terminal::Size().dimy; }

Element App::render() {
    if (stack_.empty()) return text("");
    // Draw the topmost full screen, then every overlay above it.
    int base = (int)stack_.size() - 1;
    while (base > 0 && stack_[base]->isOverlay()) --base;
    Element out = stack_[base]->render(*this);
    for (int i = base + 1; i < (int)stack_.size(); ++i)
        out = dbox({out, stack_[i]->render(*this) | clear_under | center});
    return out;
}

bool App::onEvent(Event e) {
    if (e == Event::Custom) {
        tick(0.05);
        return true;
    }
    bool handled = false;
    if (!stack_.empty()) handled = stack_.back()->onEvent(*this, e);
    applyPending();
    return handled;
}

void App::tick(double seconds) {
    if (!stack_.empty()) stack_.back()->onTick(*this, seconds);
    applyPending();
}

void App::push(std::unique_ptr<Screen> s) {
    auto shared = std::make_shared<std::unique_ptr<Screen>>(std::move(s));
    pending_.push_back([this, shared] { stack_.push_back(std::move(*shared)); });
}

void App::pop() {
    pending_.push_back([this] {
        if (!stack_.empty()) stack_.pop_back();
    });
}

void App::popAll() {
    pending_.push_back([this] { stack_.clear(); });
}

void App::replaceTop(std::unique_ptr<Screen> s) {
    pop();
    push(std::move(s));
}

void App::quit() { screen_.ExitLoopClosure()(); }

void App::message(const std::string& title, const std::string& text) { push(makeMessageBox(title, text)); }

void App::applyPending() {
    // Handlers may queue more operations while we apply these.
    while (!pending_.empty()) {
        auto ops = std::move(pending_);
        pending_.clear();
        for (auto& op : ops) op();
    }
    if (stack_.empty()) quit();
}

} // namespace vamps
