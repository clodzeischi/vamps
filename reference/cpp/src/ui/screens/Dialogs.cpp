// Pop-up dialogs: messages, multiple choice, text input, game over.
#include "ui/screens/Screens.h"

#include "ui/Theme.h"
#include "ui/Widgets.h"

namespace vamps {

using namespace ftxui;

namespace {

Element paragraphs(const std::string& body) {
    Elements lines;
    size_t start = 0;
    while (start <= body.size()) {
        size_t end = body.find('\n', start);
        std::string line = body.substr(start, end == std::string::npos ? std::string::npos : end - start);
        lines.push_back(line.empty() ? text(" ") : paragraph(line));
        if (end == std::string::npos) break;
        start = end + 1;
    }
    return vbox(std::move(lines));
}

class MessageBox : public Screen {
public:
    MessageBox(std::string title, std::string text) : title_(std::move(title)), text_(std::move(text)) {}
    bool isOverlay() const override { return true; }

    Element render(App& app) override {
        cm_.clear();
        auto close = [&app] { app.pop(); };
        // Monthly reports and the like are tables: keep them monospaced.
        bool table = text_.find("  ") != std::string::npos;
        Element body = table ? vbox([&] {
            Elements ls;
            size_t s = 0;
            while (s < text_.size()) {
                size_t e = text_.find('\n', s);
                ls.push_back(text(text_.substr(s, e == std::string::npos ? std::string::npos : e - s)));
                if (e == std::string::npos) break;
                s = e + 1;
            }
            return ls;
        }()) : paragraphs(text_);
        return panel(title_, vbox({body | color(theme::kText), text(""),
                                   hbox({filler(), button(cm_, "\n", "OK", close)})}) |
                                 size(WIDTH, LESS_THAN, 76)) |
               bgcolor(theme::kPanelBg);
    }

    bool onEvent(App& app, Event e) override {
        if (e == Event::Escape || e == Event::Character(' ')) { app.pop(); return true; }
        return cm_.handle(e);
    }

private:
    std::string title_, text_;
    ClickMap cm_;
};

class ChoiceBox : public Screen {
public:
    ChoiceBox(std::string title, std::string text, std::vector<Choice> choices)
        : title_(std::move(title)), text_(std::move(text)), choices_(std::move(choices)) {}
    bool isOverlay() const override { return true; }

    Element render(App& app) override {
        cm_.clear();
        Elements buttons;
        for (const auto& c : choices_) {
            auto action = c.action;
            buttons.push_back(button(cm_, c.key, c.label, [&app, action] {
                app.pop();
                if (action) action(app);
            }));
            buttons.push_back(text("  "));
        }
        return panel(title_, vbox({paragraphs(text_) | color(theme::kText), text(""), hflow(std::move(buttons))}) |
                                 size(WIDTH, LESS_THAN, 76)) |
               bgcolor(theme::kPanelBg);
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        if (e == Event::Escape) { app.pop(); return true; }
        return true; // modal
    }

private:
    std::string title_, text_;
    std::vector<Choice> choices_;
    ClickMap cm_;
};

class TextInput : public Screen {
public:
    TextInput(std::string title, std::string initial, std::function<void(App&, const std::string&)> done)
        : title_(std::move(title)), value_(std::move(initial)), done_(std::move(done)) {}
    bool isOverlay() const override { return true; }

    Element render(App& app) override {
        cm_.clear();
        return panel(title_, vbox({hbox({text(value_) | color(theme::kAccent), text("_") | blink}) |
                                       size(WIDTH, GREATER_THAN, 40),
                                   text(""),
                                   hbox({button(cm_, "Enter", "Accept", [&] { finish(app); }), text("  "),
                                         button(cm_, "Esc", "Cancel", [&app] { app.pop(); })})})) |
               bgcolor(theme::kPanelBg);
    }

    bool onEvent(App& app, Event e) override {
        if (e == Event::Return) { finish(app); return true; }
        if (e == Event::Escape) { app.pop(); return true; }
        if (e == Event::Backspace) { if (!value_.empty()) value_.pop_back(); return true; }
        if (e.is_character() && e.character().size() == 1 && value_.size() < 24 && std::isprint((unsigned char)e.character()[0])) {
            value_ += e.character();
            return true;
        }
        return cm_.handle(e) || true;
    }

private:
    void finish(App& app) {
        if (value_.empty()) return;
        app.pop();
        if (done_) done_(app, value_);
    }
    std::string title_, value_;
    std::function<void(App&, const std::string&)> done_;
    ClickMap cm_;
};

class GameOver : public Screen {
public:
    GameOver(bool victory, std::string text) : victory_(victory), text_(std::move(text)) {}

    Element render(App& app) override {
        cm_.clear();
        auto title = victory_ ? "VICTORY" : "THE AGENCY HAS FALLEN";
        return vbox({filler(),
                     text(title) | bold | color(victory_ ? theme::kGood : theme::kTitle) | center,
                     text(""),
                     paragraph(text_) | color(theme::kText) | size(WIDTH, LESS_THAN, 70) | center,
                     text(""),
                     button(cm_, "\n", "Return to main menu", [&app] {
                         app.game.reset();
                         app.popAll();
                         app.push(makeMainMenu());
                     }) | center,
                     filler()}) |
               bgcolor(Color::RGB(0, 0, 0));
    }

    bool onEvent(App& app, Event e) override { return cm_.handle(e); }

private:
    bool victory_;
    std::string text_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makeMessageBox(const std::string& title, const std::string& text) {
    return std::make_unique<MessageBox>(title, text);
}
std::unique_ptr<Screen> makeChoiceBox(const std::string& title, const std::string& text, std::vector<Choice> choices) {
    return std::make_unique<ChoiceBox>(title, text, std::move(choices));
}
std::unique_ptr<Screen> makeTextInput(const std::string& title, const std::string& initial,
                                      std::function<void(App&, const std::string&)> done) {
    return std::make_unique<TextInput>(title, initial, std::move(done));
}
std::unique_ptr<Screen> makeGameOver(bool victory, const std::string& text) {
    return std::make_unique<GameOver>(victory, text);
}

} // namespace vamps
