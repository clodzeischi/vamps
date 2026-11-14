#include "strategy/Politics.h"

#include <algorithm>
#include <cmath>

#include "core/Format.h"
#include "core/Random.h"
#include "strategy/Economy.h"

namespace vamps {

SecrecyBand secrecyBand(double s) {
    if (s >= 60) return SecrecyBand::Normal;
    if (s >= 30) return SecrecyBand::Scrutiny;
    return SecrecyBand::Exposed;
}

const char* secrecyBandName(SecrecyBand b) {
    switch (b) {
        case SecrecyBand::Normal: return "Clandestine";
        case SecrecyBand::Scrutiny: return "Under Scrutiny";
        case SecrecyBand::Exposed: return "EXPOSED";
    }
    return "?";
}

void changeSecrecy(GameState& g, double delta, const std::string& reason) {
    SecrecyBand before = secrecyBand(g.secrecy);
    g.secrecy = std::clamp(g.secrecy + delta, 0.0, 100.0);
    if (!reason.empty()) g.addLog(fmt("Secrecy %+.0f: %s", delta, reason.c_str()));
    SecrecyBand after = secrecyBand(g.secrecy);
    if (after != before && after > before)
        g.post(GeoEventType::Info, "Secrecy Compromised",
               std::string("The agency is now ") + secrecyBandName(after) + ".");
    checkLoseConditions(g);
}

void changeSupport(GameState& g, int nation, double delta, const std::string& reason) {
    if (nation < 0 || nation >= (int)g.nations.size()) return;
    auto& n = g.nations[nation];
    n.support = std::clamp(n.support + delta, -100.0, 100.0);
    if (!reason.empty())
        g.addLog(fmt("%s support %+.0f: %s", nations()[nation].name.c_str(), delta, reason.c_str()));
}

void changeContinentSupport(GameState& g, Continent c, double delta, const std::string& reason) {
    for (int i = 0; i < (int)nations().size(); ++i)
        if (nations()[i].continent == c) changeSupport(g, i, delta, "");
    if (!reason.empty()) g.addLog(fmt("%s support %+.0f: %s", continentName(c), delta, reason.c_str()));
}

bool airspaceOpen(const GameState& g, int nation) {
    if (nation < 0) return true; // international waters
    const auto& n = g.nations[nation];
    if (n.defected) return false;
    return !(secrecyBand(g.secrecy) == SecrecyBand::Exposed && n.support < 0);
}

int nationFunding(const GameState& g, int i) {
    const auto& n = g.nations[i];
    if (n.defected) return 0;
    double factor = std::clamp(0.6 + n.support / 150.0, 0.1, 1.4);
    double exposed = secrecyBand(g.secrecy) == SecrecyBand::Exposed ? 0.8 : 1.0;
    return (int)(nations()[i].baseFunding * 1000.0 * factor * g.diff().fundingMult * exposed);
}

// ---------------------------------------------------------------------------
// Daily: secrecy slowly recovers as stories fade; random events.
// ---------------------------------------------------------------------------

void dailyPolitics(GameState& g) {
    g.secrecy = std::min(100.0, g.secrecy + 0.1);

    Random& r = rng();
    const auto& d = g.diff();
    if (r.chance(d.positiveEventPerDay)) {
        switch (r.range(0, 2)) {
            case 0: {
                int amount = r.range(3, 10) * 100000;
                g.funds += amount;
                g.post(GeoEventType::Info, "Anonymous Donor",
                       "A private benefactor who lost family to a bloodline wires " + money(amount) + ".");
                break;
            }
            case 1: {
                int nation = r.range(0, (int)g.nations.size() - 1);
                changeSupport(g, nation, 6, "");
                g.post(GeoEventType::Info, "Public Sympathy",
                       "An investigative documentary about missing persons shifts opinion in " +
                           nations()[nation].name + " (+6 support).");
                break;
            }
            default:
                changeSecrecy(g, 4, "");
                g.post(GeoEventType::Info, "Story Buried",
                       "A friendly editor spikes a story about the agency (+4 secrecy).");
        }
    }
    // Negative events: mild, but they keep the meters moving.
    if (r.chance(0.01 * d.vampPrMult)) {
        int nation = r.range(0, (int)g.nations.size() - 1);
        changeSupport(g, nation, -5, "");
        g.post(GeoEventType::Info, "Viral Campaign",
               "A slick 'misunderstood immortals' campaign trends in " + nations()[nation].name +
                   " (-5 support).");
    }
}

// ---------------------------------------------------------------------------
// Monthly report
// ---------------------------------------------------------------------------

void monthlyPolitics(GameState& g) {
    Random& r = rng();
    std::string report;

    // 1. Vampire PR drift: every surviving bloodline works its own continent,
    //    and all of them nudge global opinion a little.
    for (int b = 0; b < kBloodlineCount; ++b) {
        if (g.bloodlines[b].destroyed) continue;
        const auto& bl = bloodline(b);
        double push = r.real(2.0, 5.0) * bl.prStrength * g.diff().vampPrMult;
        for (int i = 0; i < (int)nations().size(); ++i) {
            if (nations()[i].continent == bl.continent) changeSupport(g, i, -push, "");
            else changeSupport(g, i, -0.3 * g.diff().vampPrMult, "");
        }
    }

    // 2. Counter-PR: media budget, diminishing returns.
    for (auto& n : g.nations)
        if (n.mediaBudget > 0 && !n.defected)
            n.support = std::min(100.0, n.support + 2.0 * std::sqrt(n.mediaBudget / 50000.0));

    // 3. Infiltration decays where the public is on our side.
    for (auto& n : g.nations)
        if (n.support > 0) n.infiltration = std::max(0.0, n.infiltration - 5);

    // 4. Defections.
    for (int i = 0; i < (int)g.nations.size(); ++i) {
        auto& n = g.nations[i];
        if (n.defected) continue;
        if (n.support <= -60 || n.infiltration >= 100) {
            n.defected = true;
            n.mediaBudget = 0;
            g.post(GeoEventType::Info, "Nation Withdraws",
                   nations()[i].name + (n.infiltration >= 100
                                            ? " has been compromised by the bloodlines and withdraws from the agency."
                                            : " bows to public opinion and withdraws from the agency."));
        }
    }

    // 5. Money.
    int64_t income = 0;
    report += "FUNDING\n";
    for (int i = 0; i < (int)g.nations.size(); ++i) {
        auto& n = g.nations[i];
        n.lastFunding = nationFunding(g, i);
        income += n.lastFunding;
        report += fmt("  %-16s %+5.0f  %12s%s\n", nations()[i].name.c_str(), n.support - n.monthStartSupport,
                      money(n.lastFunding).c_str(), n.defected ? "  WITHDRAWN" : "");
        n.monthStartSupport = n.support;
    }
    int64_t salaries = monthlySalaries(g), rent = monthlyCraftRent(g), upkeep = monthlyFacilityUpkeep(g),
            media = monthlyMediaSpend(g);
    int64_t expenses = salaries + rent + upkeep + media;
    g.funds += income - expenses;
    report += fmt("\nIncome %s\nSalaries %s  Craft %s  Facilities %s  Media %s\nBalance %s\n",
                  money(income).c_str(), money(salaries).c_str(), money(rent).c_str(), money(upkeep).c_str(),
                  money(media).c_str(), money(g.funds).c_str());
    report += fmt("\nSecrecy %.0f (%s)   Average support %+.0f\n", g.secrecy,
                  secrecyBandName(secrecyBand(g.secrecy)), g.averageSupport());

    if (g.funds < 0) {
        ++g.negativeMonths;
        report += "\nWARNING: the agency is in debt. Two months in a row and the council will shut us down.\n";
    } else {
        g.negativeMonths = 0;
    }

    // 6. New black market stock.
    rotateBlackMarket(g);

    g.monthIndex++;
    g.post(GeoEventType::MonthlyReport, "Monthly Report", report);
    checkLoseConditions(g);
}

void checkLoseConditions(GameState& g) {
    if (g.gameOver) return;
    auto lose = [&](const std::string& why) {
        g.gameOver = true;
        g.gameOverReason = why;
        g.post(GeoEventType::GameOver, "The Agency Has Fallen", why);
    };
    if (g.secrecy <= 0) lose("The agency's existence is public. Its funders disown it, and the bloodlines go to ground with the public on their side.");
    else if (g.defectedCount() * 2 >= (int)g.nations.size()) lose("Half the funding nations have withdrawn. The council dissolves the agency.");
    else if (g.negativeMonths >= 2) lose("Two months of debt. The council will not pay for failure.");
}

} // namespace vamps
