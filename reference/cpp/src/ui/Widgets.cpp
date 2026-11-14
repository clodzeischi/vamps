#include "ui/Widgets.h"

#include <algorithm>
#include <cstring>

#include <ftxui/component/mouse.hpp>

#include "ui/Theme.h"

namespace vamps {

using namespace ftxui;

void ClickMap::clear() {
    boxes_.clear();
    handlers_.clear();
    keys_.clear();
}

Element ClickMap::area(Element e, ClickHandlers h) {
    boxes_.emplace_back();
    handlers_.push_back(std::move(h));
    return e | reflect(boxes_.back());
}

void ClickMap::hotkey(const std::string& key, std::function<void()> fn) { keys_.push_back({key, std::move(fn)}); }

bool ClickMap::handle(Event e) {
    if (e.is_mouse()) {
        Mouse& m = e.mouse();
        // Later areas are drawn on top, so search from the back.
        for (int i = (int)boxes_.size() - 1; i >= 0; --i) {
            if (!boxes_[i].Contain(m.x, m.y)) continue;
            const ClickHandlers& h = handlers_[i];
            std::function<void()> fn;
            if (m.button == Mouse::Left && m.motion == Mouse::Pressed) fn = h.left;
            else if (m.button == Mouse::Right && m.motion == Mouse::Pressed) fn = h.right;
            else if (m.button == Mouse::WheelUp) fn = h.wheelUp;
            else if (m.button == Mouse::WheelDown) fn = h.wheelDown;
            if (fn) {
                auto copy = fn; // handler may clear this map
                copy();
                return true;
            }
        }
        return false;
    }
    if (e.is_character() || e == Event::Return || e == Event::Escape) {
        std::string in = e == Event::Return ? "\n" : e == Event::Escape ? "\x1b" : e.character();
        for (auto& [k, fn] : keys_)
            if (k == in) {
                auto copy = fn;
                copy();
                return true;
            }
    }
    return false;
}

Element button(ClickMap& cm, const std::string& key, const std::string& label, std::function<void()> fn,
               bool enabled) {
    Elements parts;
    if (!key.empty()) {
        std::string shown = key == "\n" ? "Enter" : key == "\x1b" ? "Esc" : key == "\t" ? "Tab" : key == " " ? "Space" : key;
        parts.push_back(text("[" + shown + "]") | color(enabled ? theme::kAccent : theme::kDim));
        parts.push_back(text(" "));
    }
    parts.push_back(text(label) | color(enabled ? theme::kText : theme::kDim));
    Element e = hbox(std::move(parts)) | bgcolor(theme::kButtonBg);
    if (!enabled) return e;
    if (!key.empty()) cm.hotkey(key, fn);
    return cm.area(e, std::move(fn));
}

Element listView(ClickMap& cm, ListState& st, const std::vector<Element>& rows, int height,
                 std::function<void(int)> onActivate) {
    int n = (int)rows.size();
    if (n == 0) return text("  (none)") | color(theme::kDim);
    st.selected = std::clamp(st.selected, 0, n - 1);
    height = std::max(1, height);
    if (st.selected < st.scroll) st.scroll = st.selected;
    if (st.selected >= st.scroll + height) st.scroll = st.selected - height + 1;
    st.scroll = std::clamp(st.scroll, 0, std::max(0, n - height));
    Elements out;
    for (int i = st.scroll; i < std::min(n, st.scroll + height); ++i) {
        Element row = rows[i];
        if (i == st.selected) row = row | bgcolor(theme::kSelectBg) | bold;
        ListState* s = &st;
        out.push_back(cm.area(row | xflex, ClickHandlers{
            [s, i, onActivate] {
                if (s->selected == i && onActivate) onActivate(i);
                s->selected = i;
            },
            {},
            [s] { s->scroll = std::max(0, s->scroll - 1); s->selected = std::max(0, s->selected - 1); },
            [s, n] { s->selected = std::min(n - 1, s->selected + 1); },
        }));
    }
    if (n > height)
        out.push_back(text("  " + std::to_string(st.scroll + 1) + "-" + std::to_string(std::min(n, st.scroll + height)) +
                           " of " + std::to_string(n)) | color(theme::kDim));
    return vbox(std::move(out));
}

bool listKeys(ListState& st, const Event& e, int count, std::function<void(int)> onActivate) {
    if (count <= 0) return false;
    if (e == Event::ArrowUp || e == Event::Character('k')) { st.selected = std::max(0, st.selected - 1); return true; }
    if (e == Event::ArrowDown || e == Event::Character('j')) { st.selected = std::min(count - 1, st.selected + 1); return true; }
    if (e == Event::PageUp) { st.selected = std::max(0, st.selected - 10); return true; }
    if (e == Event::PageDown) { st.selected = std::min(count - 1, st.selected + 10); return true; }
    if (e == Event::Home) { st.selected = 0; return true; }
    if (e == Event::End) { st.selected = count - 1; return true; }
    if (e == Event::Return && onActivate) { onActivate(std::clamp(st.selected, 0, count - 1)); return true; }
    return false;
}

Element meter(int value, int max, int width, Color c) {
    max = std::max(1, max);
    int filled = std::clamp(value * width / max, 0, width);
    return hbox({text(std::string(filled, ' ')) | bgcolor(c),
                 text(std::string(width - filled, ' ')) | bgcolor(Color::RGB(40, 40, 44))});
}

Element panel(const std::string& title, Element content) {
    return window(text(" " + title + " ") | bold | color(theme::kAccent), std::move(content));
}

Element header(const std::string& title, const std::string& right) {
    return hbox({text(" " + title + " ") | bold | color(Color::RGB(255, 255, 255)) | bgcolor(Color::RGB(110, 20, 28)),
                 filler() | bgcolor(Color::RGB(50, 12, 16)),
                 text(right + " ") | color(theme::kAccent) | bgcolor(Color::RGB(50, 12, 16))});
}

Element textBlock(const std::string& body) {
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

bool isKey(const Event& e, const char* chars) {
    if (!e.is_character()) return false;
    const std::string& c = e.character();
    return c.size() == 1 && std::strchr(chars, c[0]) != nullptr;
}

} // namespace vamps
