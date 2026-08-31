// parseDeepLink must accept BOTH the legacy query form (/match?id=5) and the new
// path form (/match/5) during the web's path-route cutover — the id is the ?id=
// param, falling back to the second path segment; the entity is the first segment.
import 'package:flutter_test/flutter_test.dart';
import 'package:youthscores/core/services/notification_service.dart';

void main() {
  ({String target, String? id}) parse(String url) =>
      NotificationService.parseDeepLink(Uri.parse(url));

  group('legacy query form', () {
    test('/match?id=5', () {
      final r = parse('/match?id=5');
      expect(r.target, 'match');
      expect(r.id, '5');
    });
    test('/competition?id=12&week=3 keeps id from query', () {
      final r = parse('/competition?id=12&week=3');
      expect(r.target, 'competition');
      expect(r.id, '12');
    });
    test('absolute url with query', () {
      final r = parse('https://www.youthscores.org/player?id=99&tab=career');
      expect(r.target, 'player');
      expect(r.id, '99');
    });
  });

  group('new path form', () {
    test('/match/5', () {
      final r = parse('/match/5');
      expect(r.target, 'match');
      expect(r.id, '5');
    });
    test('/competition/12 with trailing sub-params still resolves id', () {
      final r = parse('/competition/12?week=3');
      expect(r.target, 'competition');
      expect(r.id, '12');
    });
    test('absolute url path form', () {
      final r = parse('https://www.youthscores.org/team/7/');
      expect(r.target, 'team');
      expect(r.id, '7');
    });
  });

  group('edge cases', () {
    test('query id wins over path segment when both present', () {
      final r = parse('/match/5?id=9');
      expect(r.id, '9');
    });
    test('no id at all', () {
      final r = parse('/news');
      expect(r.target, 'news');
      expect(r.id, isNull);
    });
  });
}
