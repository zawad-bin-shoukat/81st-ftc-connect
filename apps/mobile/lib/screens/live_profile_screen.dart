import 'package:flutter/material.dart';

import '../api_client.dart';
import '../contact_actions.dart';

String ordinalBatch(dynamic value) {
  if (value == null) return 'Unknown';
  final n = value as int;
  final ending = n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : switch (n % 10) {
          1 => 'st',
          2 => 'nd',
          3 => 'rd',
          _ => 'th',
        };
  return '$n$ending';
}

class LiveMemberDetail extends StatelessWidget {
  const LiveMemberDetail({required this.api, required this.id, super.key});
  final ApiClient api;
  final String id;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Member profile')),
    body: LiveProfileScreen(api: api, memberId: id),
  );
}

class LiveProfileScreen extends StatefulWidget {
  const LiveProfileScreen({
    required this.api,
    this.memberId,
    this.onUpdated,
    super.key,
  });
  final ApiClient api;
  final String? memberId;
  final VoidCallback? onUpdated;
  @override
  State<LiveProfileScreen> createState() => _LiveProfileScreenState();
}

class _LiveProfileScreenState extends State<LiveProfileScreen> {
  late Future<Map<String, dynamic>> _profile = _fetch();
  Future<Map<String, dynamic>> _fetch() => widget.api.request(
    'GET',
    widget.memberId == null ? '/me' : '/members/${widget.memberId!}',
  );
  Future<void> _edit(Map<String, dynamic> member) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => LiveEditProfile(api: widget.api, member: member),
      ),
    );
    if (changed == true && mounted) {
      setState(() => _profile = _fetch());
      widget.onUpdated?.call();
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: _profile,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(snapshot.error.toString(), textAlign: TextAlign.center),
                TextButton(
                  onPressed: () => setState(() => _profile = _fetch()),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        );
      }
      final data = snapshot.data!;
      final rows = <String, String>{
        'FTC ID': data['ftcId'].toString(),
        'Section': data['section'] as String,
        'Cadre': data['cadre']['name'] as String,
        'BCS batch': ordinalBatch(data['bcsBatch']),
        'Education': data['education'] as String,
        'University': data['university'] as String,
        'WhatsApp contact': data['phone'] as String,
        'Email': data['email'] as String,
        'Blood group': data['bloodGroup'] as String,
        'Home district': data['homeDistrict'] as String,
        if (data['aboutMe'] != null && data['aboutMe'] != '')
          'About me': data['aboutMe'] as String,
        if (data['favouriteQuotation'] != null &&
            data['favouriteQuotation'] != '')
          'Favourite quotation': data['favouriteQuotation'] as String,
        if (widget.memberId == null)
          'Login number': data['loginPhone'] as String,
      };
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Icon(Icons.account_circle_outlined, size: 88),
              Text(
                data['name'] as String,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if (widget.memberId == null) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () => _edit(data),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit my profile'),
                ),
              ],
              const SizedBox(height: 16),
              for (final entry in rows.entries)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entry.key,
                          style: Theme.of(context).textTheme.labelMedium,
                        ),
                        const SizedBox(height: 4),
                        SelectableText(entry.value),
                        if (entry.key == 'WhatsApp contact')
                          ContactActions(raw: entry.value),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}

class LiveEditProfile extends StatefulWidget {
  const LiveEditProfile({required this.api, required this.member, super.key});
  final ApiClient api;
  final Map<String, dynamic> member;
  @override
  State<LiveEditProfile> createState() => _LiveEditProfileState();
}

class _LiveEditProfileState extends State<LiveEditProfile> {
  static const labels = {
    'name': 'Name',
    'education': 'Education',
    'university': 'University',
    'phone': 'WhatsApp contact',
    'email': 'Email',
    'bloodGroup': 'Blood group',
    'homeDistrict': 'Home district',
    'bcsBatch': 'BCS batch (blank for unknown)',
    'aboutMe': 'About me',
    'favouriteQuotation': 'Favourite quotation',
  };
  final _form = GlobalKey<FormState>();
  late final _fields = {
    for (final key in labels.keys)
      key: TextEditingController(text: widget.member[key]?.toString() ?? ''),
  };
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final body = <String, dynamic>{};
    for (final entry in _fields.entries) {
      final dynamic value = entry.key == 'bcsBatch'
          ? int.tryParse(entry.value.text.trim())
          : entry.value.text;
      if (value !=
          (widget.member[entry.key] ?? (entry.key == 'bcsBatch' ? null : ''))) {
        body[entry.key] = value;
      }
    }
    if (body.isEmpty) {
      Navigator.pop(context, false);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.request('PATCH', '/me', body: body);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Edit my profile')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700),
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Your login number is separate from your WhatsApp contact. FTC ID, section and cadre are managed by the roster administrator.',
              ),
              const SizedBox(height: 16),
              for (final entry in labels.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: TextFormField(
                    controller: _fields[entry.key],
                    decoration: InputDecoration(labelText: entry.value),
                    keyboardType: entry.key == 'email'
                        ? TextInputType.emailAddress
                        : entry.key == 'bcsBatch'
                        ? TextInputType.number
                        : TextInputType.multiline,
                    maxLines:
                        ['aboutMe', 'favouriteQuotation'].contains(entry.key)
                        ? 3
                        : 1,
                    validator: (text) {
                      final value = text?.trim() ?? '';
                      if (entry.key == 'bcsBatch') {
                        final number = int.tryParse(value);
                        return value.isNotEmpty &&
                                (number == null || number < 1 || number > 32767)
                            ? 'Enter a positive batch number, or leave blank.'
                            : null;
                      }
                      if (![
                            'aboutMe',
                            'favouriteQuotation',
                          ].contains(entry.key) &&
                          value.isEmpty) {
                        return 'This field is required.';
                      }
                      return null;
                    },
                  ),
                ),
              if (_error != null)
                Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: Text(_busy ? 'Saving…' : 'Save changes'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
