import 'package:integration_test/integration_test.dart';

import '../test/frontend_flow_test.dart' as preview;
import '../test/session_flow_test.dart' as session;

import '../test/contact_actions_test.dart' as contacts;
import '../test/registration_flow_test.dart' as registration;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  preview.main();
  session.main();
  contacts.main();
  registration.main();
}
