import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ftc_connect/api_client.dart';
import 'package:ftc_connect/screens/membership_review_screen.dart';
import 'package:ftc_connect/screens/live_profile_screen.dart';

final request = {
  'id': 'request-1',
  'name': 'Synthetic applicant',
  'ftcId': 9998,
  'phone': '+12025550100',
  'evidence': 'Synthetic authoritative roster reference.',
  'status': 'pending',
  'createdAt': '2026-10-02T00:00:00Z',
};
final cadre = {'id': 'cadre-1', 'name': 'Synthetic cadre'};
Finder field(String label) => find.byWidgetPredicate(
  (w) => w is TextField && w.decoration?.labelText == label,
);
Future<void> fill(WidgetTester tester, String label, String value) async {
  await tester.ensureVisible(field(label));
  await tester.enterText(field(label), value);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'approval requires complete profile, verification and confirmation',
    (tester) async {
      final writes = <http.Request>[];
      bool approved = false;
      final api = ApiClient(
        client: MockClient((r) async {
          if (r.method == 'POST') {
            writes.add(r);
            approved = true;
            return http.Response(
              jsonEncode({'message': 'Member approved.'}),
              201,
            );
          }
          if (r.url.path.endsWith('/request-1')) {
            return http.Response(
              jsonEncode({
                'request': request,
                'cadres': [cadre],
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'items': approved ? [] : [request],
              'total': approved ? 0 : 1,
              'totalPages': approved ? 0 : 1,
            }),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(home: MembershipReviewScreen(api: api)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Synthetic applicant'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Approve and add member'));
      await tester.tap(find.text('Approve and add member'));
      await tester.pumpAndSettle();
      expect(writes, isEmpty);
      await tester.ensureVisible(find.byType(DropdownButtonFormField<String>));
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Synthetic cadre').last);
      await tester.pumpAndSettle();
      for (final entry in {
        'Section': 'A',
        'Education': 'Degree',
        'University': 'University',
        'Email': 'test@example.com',
        'Blood group (as provided)': 'Unknown',
        'Home district': 'District',
        'How you verified membership':
            'Confirmed by client against official roster.',
      }.entries) {
        await fill(tester, entry.key, entry.value);
      }
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Approve and add member'));
      await tester.tap(find.text('Approve and add member'));
      await tester.pumpAndSettle();
      expect(
        find.text('Confirm that you verified membership first.'),
        findsOneWidget,
      );
      expect(writes, isEmpty);
      await tester.ensureVisible(find.byType(CheckboxListTile));
      await tester.tap(find.byType(CheckboxListTile));
      await tester.ensureVisible(find.text('Approve and add member'));
      await tester.tap(find.text('Approve and add member'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(writes, isEmpty);
      await tester.tap(find.text('Approve and add member'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm approval'));
      await tester.pumpAndSettle();
      expect(writes.single.url.path, '/admin/registrations/request-1/approve');
      final body = jsonDecode(writes.single.body);
      expect(body['membershipConfirmed'], true);
      expect(body['profile']['bcsBatch'], isNull);
      expect(body['profile']['cadreId'], 'cadre-1');
      expect(body.containsKey('reviewedByMemberId'), false);
      expect(find.text('Member approved.'), findsOneWidget);
      expect(find.text('0 pending requests'), findsOneWidget);
    },
  );

  testWidgets('rejection requires reason and history is read only', (
    tester,
  ) async {
    final writes = <http.Request>[];
    final api = ApiClient(
      client: MockClient((r) async {
        if (r.method == 'POST') {
          writes.add(r);
          return http.Response('{"message":"Request rejected."}', 201);
        }
        return http.Response(
          jsonEncode({
            'request': request,
            'cadres': [cadre],
          }),
          200,
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) =>
                    MembershipRequestDetail(api: api, id: 'request-1'),
              ),
            ),
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Reject request'));
    await tester.tap(find.text('Reject request'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm rejection'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a reason'), findsOneWidget);
    expect(writes, isEmpty);
    await tester.enterText(
      field('Reason for rejection'),
      'Membership could not be confirmed.',
    );
    await tester.tap(find.text('Confirm rejection'));
    await tester.pumpAndSettle();
    expect(writes.single.url.path, '/admin/registrations/request-1/reject');
    expect(
      jsonDecode(writes.single.body)['reviewNote'],
      'Membership could not be confirmed.',
    );
    final historyApi = ApiClient(
      client: MockClient(
        (r) async => http.Response(
          jsonEncode({
            'request': {
              ...request,
              'status': 'rejected',
              'reviewedAt': '2026-10-02T01:00:00Z',
              'reviewNote': 'Membership could not be confirmed.',
              'reviewedBy': {'name': 'Synthetic admin', 'ftcId': 1000},
            },
            'cadres': [cadre],
          }),
          200,
        ),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: MembershipRequestDetail(api: historyApi, id: 'request-1'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Approve and add member'), findsNothing);
    expect(find.text('Reject request'), findsNothing);
    expect(find.text('Membership could not be confirmed.'), findsOneWidget);
    expect(find.text('Reviewer: Synthetic admin · FTC 1000'), findsOneWidget);
  });

  testWidgets('queue errors can retry and history filter reaches API', (
    tester,
  ) async {
    bool fail = true;
    final reads = <http.Request>[];
    final api = ApiClient(
      client: MockClient((r) async {
        reads.add(r);
        if (fail) {
          return http.Response(
            '{"message":"Administrator access required."}',
            403,
          );
        }
        return http.Response('{"items":[],"total":0,"totalPages":0}', 200);
      }),
    );
    await tester.pumpWidget(
      MaterialApp(home: MembershipReviewScreen(api: api)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Administrator access required.'), findsOneWidget);
    fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('No requests here.'), findsOneWidget);
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approved').last);
    await tester.pumpAndSettle();
    expect(reads.last.url.queryParameters['status'], 'approved');
  });

  testWidgets('administrator button appears only on authorized own profile', (
    tester,
  ) async {
    for (final allowed in [false, true]) {
      final person = {
        'name': 'Synthetic member',
        'ftcId': 1000,
        'section': 'A',
        'cadre': cadre,
        'bcsBatch': null,
        'education': 'Degree',
        'university': 'University',
        'phone': 'Contact',
        'email': 'test@example.com',
        'bloodGroup': 'Unknown',
        'homeDistrict': 'District',
        'loginPhone': '+12025550100',
        'isAdministrator': allowed,
      };
      final api = ApiClient(
        client: MockClient((_) async => http.Response(jsonEncode(person), 200)),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: LiveProfileScreen(api: api, key: ValueKey(allowed)),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Review membership requests'),
        allowed ? findsOneWidget : findsNothing,
      );
    }
  });
}
