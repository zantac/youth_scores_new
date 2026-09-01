import '../models/competition_data_model.dart';
import '../models/standing.dart';

class _H2HStat {
  int points = 0;
  int goalsFor = 0;
  int goalsAgainst = 0;
  int get goalDiff => goalsFor - goalsAgainst;
}

class StandingsCalculator {
  static List<Standing> calculate(
    List<Match> matches,
    List<Team> teams, {
    String? groupId,
    String? stageFilter,
  }) {
    final bool filterGroup = groupId != null && groupId.isNotEmpty;
    final bool filterStage = stageFilter != null && stageFilter.isNotEmpty;

    final map = <String, Standing>{};
    for (final t in teams) {
      if (!filterGroup || t.groupKey == groupId) {
        map[t.id] = Standing(t.id, pointDeduction: t.pointDeduction);
      }
    }

    // Pre-filter eligible matches — reused for H2H checks later
    final eligible = matches.where((m) {
      if (m.isKnockout) return false;
      if (filterStage && m.stage != stageFilter) return false;
      if (!m.isCompleted) return false;
      if (m.homeScore == null || m.awayScore == null) return false;
      return true;
    }).toList();

    for (final m in eligible) {
      final hs  = m.homeScore!;
      final as_ = m.awayScore!;
      final home = map[m.homeTeamId];
      final away = map[m.awayTeamId];
      if (home == null && away == null) continue;
      if (home != null) {
        home.played++;
        home.goalsFor     += hs;
        home.goalsAgainst += as_;
        if (hs > as_)      { home.won++;   home.points += 3; }
        else if (hs < as_) { home.lost++; }
        else               { home.drawn++; home.points++;    }
      }
      if (away != null) {
        away.played++;
        away.goalsFor     += as_;
        away.goalsAgainst += hs;
        if (as_ > hs)      { away.won++;   away.points += 3; }
        else if (as_ < hs) { away.lost++; }
        else               { away.drawn++; away.points++;    }
      }
    }

    // Primary sort by points
    final all = map.values.toList()
      ..sort((a, b) => b.points.compareTo(a.points));

    // Apply tiebreakers within each same-points group
    final result = <Standing>[];
    int i = 0;
    while (i < all.length) {
      int j = i + 1;
      while (j < all.length && all[j].points == all[i].points) {
        j++;
      }
      final group = all.sublist(i, j);
      result.addAll(group.length == 1 ? group : _breakTie(group, eligible));
      i = j;
    }

    for (var k = 0; k < result.length; k++) {
      result[k].position = k + 1;
    }
    return result;
  }

  // Resolves a group of teams that are level on points.
  static List<Standing> _breakTie(
    List<Standing> tied,
    List<Match> eligible,
  ) {
    final tiedIds = tied.map((s) => s.teamId).toSet();
    final ids     = tiedIds.toList();

    // Matches played only between the tied teams
    final h2hMatches = eligible
        .where((m) =>
            tiedIds.contains(m.homeTeamId) &&
            tiedIds.contains(m.awayTeamId))
        .toList();

    // Condition: every pair must have played exactly 2 matches
    bool allPlayedTwice = true;
    outer:
    for (int i = 0; i < ids.length; i++) {
      for (int j = i + 1; j < ids.length; j++) {
        final count = h2hMatches
            .where((m) =>
                (m.homeTeamId == ids[i] && m.awayTeamId == ids[j]) ||
                (m.homeTeamId == ids[j] && m.awayTeamId == ids[i]))
            .length;
        if (count != 2) {
          allPlayedTwice = false;
          break outer;
        }
      }
    }

    if (!allPlayedTwice) {
      // Fallback: overall GD → overall GF
      return tied
        ..sort((a, b) {
          final c = b.goalDiff.compareTo(a.goalDiff);
          if (c != 0) return c;
          return b.goalsFor.compareTo(a.goalsFor);
        });
    }

    // Build H2H mini-table
    final h2h = <String, _H2HStat>{
      for (final s in tied) s.teamId: _H2HStat()
    };
    for (final m in h2hMatches) {
      final hs  = m.homeScore!;
      final as_ = m.awayScore!;
      final home = h2h[m.homeTeamId]!;
      final away = h2h[m.awayTeamId]!;
      home.goalsFor     += hs;
      home.goalsAgainst += as_;
      away.goalsFor     += as_;
      away.goalsAgainst += hs;
      if (hs > as_)       { home.points += 3; }
      else if (hs == as_) { home.points++;  away.points++; }
      else                { away.points += 3; }
    }

    return tied
      ..sort((a, b) {
        final ha = h2h[a.teamId]!;
        final hb = h2h[b.teamId]!;
        int c = hb.points.compareTo(ha.points);      // H2H points
        if (c != 0) return c;
        c = hb.goalDiff.compareTo(ha.goalDiff);       // H2H goal difference
        if (c != 0) return c;
        c = b.goalDiff.compareTo(a.goalDiff);          // Overall goal difference
        if (c != 0) return c;
        return b.goalsFor.compareTo(a.goalsFor);       // Overall goals scored
      });
  }

  static Map<String, List<Standing>> byGroup(
    List<Match> matches,
    List<Team> teams,
  ) {
    final groups = teams
        .map((t) => t.groupKey ?? '')
        .where((g) => g.isNotEmpty)
        .toSet()
        .toList()
      ..sort();

    if (groups.isEmpty) {
      return {'': calculate(matches, teams)};
    }

    return {
      for (final g in groups)
        g: calculate(matches, teams, groupId: g),
    };
  }
}
