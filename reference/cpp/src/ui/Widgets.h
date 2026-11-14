#pragma once
// Small immediate-mode widgets on top of FTXUI elements.
//
// A ClickMap is rebuilt every frame: render code wraps elements with
// `cm.area(...)` (or uses button()/listView()), and the event handler calls
// `cm.handle(event)` to dispatch mouse clicks, the wheel and hotkeys.

#include <deque>
#include <functional>
#include <string>
#include <vector>

#include <ftxui/component/event.hpp>
#include <ftxui/dom/elements.hpp>
#include <ftxui/screen/box.hpp>

namespace vamps {

struct ClickHandlers {
    std::function<void()> left;
    std::function<void()> right;
    std::function<void()> wheelUp;
    std::function<void()> wheelDown;
};

class ClickMap {
public:
    void clear();
    ftxui::Element area(ftxui::Element e, ClickHandlers h);
    ftxui::Element area(ftxui::Element e, std::function<void()> left) { return area(std::move(e), ClickHandlers{std::move(left), {}, {}, {}}); }
    void hotkey(const std::string& key, std::function<void()> fn);
    bool handle(ftxui::Event e);

    // The most recent box drawn for an area (for coordinate mapping).
    const ftxui::Box* lastBox() const { return boxes_.empty() ? nullptr : &boxes_.back(); }

private:
    std::deque<ftxui::Box> boxes_; // deque: stable addresses for reflect()
    std::vector<ClickHandlers> handlers_;
    std::vector<std::pair<std::string, std::function<void()>>> keys_;
};

// "[K] Label" button. `key` may be empty for mouse-only buttons.
ftxui::Element button(ClickMap& cm, const std::string& key, const std::string& label, std::function<void()> fn,
                      bool enabled = true);

// Scrollable, selectable list. Click selects; clicking the selected row
// (or Enter) activates it.
struct ListState {
    int selected = 0;
    int scroll = 0;
};
ftxui::Element listView(ClickMap& cm, ListState& st, const std::vector<ftxui::Element>& rows, int height,
                        std::function<void(int)> onActivate);
// Arrow keys / PageUp / PageDown / Enter for a list. Returns true if handled.
bool listKeys(ListState& st, const ftxui::Event& e, int count, std::function<void(int)> onActivate);

// A horizontal bar like the original's TU / health bars.
ftxui::Element meter(int value, int max, int width, ftxui::Color color);

// A framed panel with a title.
ftxui::Element panel(const std::string& title, ftxui::Element content);

// Screen header line.
ftxui::Element header(const std::string& title, const std::string& right = "");

// Word-wrapped text that keeps blank lines between paragraphs.
ftxui::Element textBlock(const std::string& body);

bool isKey(const ftxui::Event& e, const char* chars); // any of the characters

} // namespace vamps
