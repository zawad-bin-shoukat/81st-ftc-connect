import 'package:flutter/material.dart';

import '../api_client.dart';
import '../districts.dart';

class MembershipReviewScreen extends StatefulWidget {
  const MembershipReviewScreen({required this.api, super.key});
  final ApiClient api;
  @override
  State<MembershipReviewScreen> createState() => _MembershipReviewScreenState();
}

class _MembershipReviewScreenState extends State<MembershipReviewScreen> {
  String _status = 'pending';
  int _page = 1;
  late Future<Map<String, dynamic>> _requests = _fetch();
  Future<Map<String, dynamic>> _fetch() => widget.api.request(
    'GET',
    '/admin/registrations?status=$_status&page=$_page',
  );
  void _reload() => setState(() {
    _requests = _fetch();
  });
  Future<void> _open(String id) async {
    final message = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => MembershipRequestDetail(api: widget.api, id: id),
      ),
    );
    if (!mounted) return;
    if (message != null) _page = 1;
    _reload();
    if (message != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Membership requests'),
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh requests',
        ),
      ],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(labelText: 'Request status'),
                items: const [
                  DropdownMenuItem(value: 'pending', child: Text('Pending')),
                  DropdownMenuItem(value: 'approved', child: Text('Approved')),
                  DropdownMenuItem(value: 'rejected', child: Text('Rejected')),
                ],
                onChanged: (value) {
                  if (value == null) return;
                  _status = value;
                  _page = 1;
                  _reload();
                },
              ),
            ),
            Expanded(
              child: FutureBuilder<Map<String, dynamic>>(
                future: _requests,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return _ReviewError(error: snapshot.error!, retry: _reload);
                  }
                  final data = snapshot.data!;
                  final items = data['items'] as List<dynamic>;
                  final pages = data['totalPages'] as int;
                  return Column(
                    children: [
                      Expanded(
                        child: ListView(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          children: [
                            Text('${data['total']} $_status requests'),
                            if (items.isEmpty)
                              const Padding(
                                padding: EdgeInsets.all(32),
                                child: Text('No requests here.'),
                              ),
                            for (final item in items)
                              Card(
                                child: ListTile(
                                  title: Text(item['name'] as String),
                                  subtitle: Text(
                                    'FTC ${item['ftcId']} · ${item['phone']}',
                                  ),
                                  trailing: const Icon(Icons.chevron_right),
                                  onTap: () => _open(item['id'] as String),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (pages > 0)
                        SafeArea(
                          top: false,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              IconButton(
                                onPressed: _page > 1
                                    ? () {
                                        _page--;
                                        _reload();
                                      }
                                    : null,
                                tooltip: 'Previous requests',
                                icon: const Icon(Icons.chevron_left),
                              ),
                              Text('Page $_page of $pages'),
                              IconButton(
                                onPressed: _page < pages
                                    ? () {
                                        _page++;
                                        _reload();
                                      }
                                    : null,
                                tooltip: 'Next requests',
                                icon: const Icon(Icons.chevron_right),
                              ),
                            ],
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class MembershipRequestDetail extends StatefulWidget {
  const MembershipRequestDetail({
    required this.api,
    required this.id,
    super.key,
  });
  final ApiClient api;
  final String id;
  @override
  State<MembershipRequestDetail> createState() =>
      _MembershipRequestDetailState();
}

class _MembershipRequestDetailState extends State<MembershipRequestDetail> {
  final _form = GlobalKey<FormState>();
  final _fields = {
    for (final key in [
      'section',
      'education',
      'university',
      'email',
      'bloodGroup',
      'homeDistrict',
      'bcsBatch',
      'reviewNote',
    ])
      key: TextEditingController(),
  };
  String? _cadreId, _error;
  bool _confirmed = false, _busy = false;
  late Future<Map<String, dynamic>> _detail = _fetch();
  Future<Map<String, dynamic>> _fetch() =>
      widget.api.request('GET', '/admin/registrations/${widget.id}');
  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _approve(Map<String, dynamic> request) async {
    if (!_form.currentState!.validate()) return;
    if (!_confirmed) {
      setState(() => _error = 'Confirm that you verified membership first.');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approve membership?'),
        content: Text(
          'Add ${request['name']} (FTC ${request['ftcId']}) to the roster? They can then sign in using ${request['phone']} and OTP.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm approval'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _send('approve', {
      'membershipConfirmed': true,
      'reviewNote': _fields['reviewNote']!.text.trim(),
      'profile': {
        for (final key in [
          'section',
          'education',
          'university',
          'email',
          'bloodGroup',
          'homeDistrict',
        ])
          key: _fields[key]!.text.trim(),
        'cadreId': _cadreId,
        'bcsBatch': int.tryParse(_fields['bcsBatch']!.text.trim()),
      },
    });
  }

  Future<void> _reject() async {
    final submitted = await showDialog<String>(
      context: context,
      builder: (_) => const _RejectionDialog(),
    );
    if (submitted == null || !mounted) return;
    await _send('reject', {'reviewNote': submitted});
  }

  Future<void> _send(String action, Map<String, dynamic> body) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.api.request(
        'POST',
        '/admin/registrations/${widget.id}/$action',
        body: body,
      );
      if (mounted) Navigator.pop(context, result['message'] as String);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Review membership'),
      actions: [
        IconButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                  _error = null;
                  _detail = _fetch();
                }),
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh request',
        ),
      ],
    ),
    body: FutureBuilder<Map<String, dynamic>>(
      future: _detail,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _ReviewError(
            error: snapshot.error!,
            retry: () => setState(() {
              _detail = _fetch();
            }),
          );
        }
        final data = snapshot.data!;
        final request = data['request'] as Map<String, dynamic>;
        final pending = request['status'] == 'pending';
        final cadres = data['cadres'] as List<dynamic>;
        return Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 700),
            child: Form(
              key: _form,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      request['name'] as String,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    SelectableText(
                      'FTC ${request['ftcId']} · ${request['phone']}',
                    ),
                    Text('Status: ${request['status']}'),
                    Text(
                      'Submitted: ${DateTime.parse(request['createdAt'] as String).toLocal()}',
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Membership details supplied',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    SelectableText(request['evidence'] as String),
                    if (!pending) ...[
                      const SizedBox(height: 20),
                      Text(
                        'Reviewed: ${request['reviewedAt'] == null ? 'Not recorded' : DateTime.parse(request['reviewedAt'] as String).toLocal()}',
                      ),
                      Text(
                        request['reviewedByTestAccount'] != null
                            ? 'Reviewer: test administrator · Test ID ${request['reviewedByTestAccount']['testId']}'
                            : request['reviewedBy'] == null
                            ? 'Reviewer: local administrator tool'
                            : 'Reviewer: ${request['reviewedBy']['name']} · FTC ${request['reviewedBy']['ftcId']}',
                      ),
                      SelectableText(
                        request['reviewNote'] as String? ??
                            'No review note recorded.',
                      ),
                    ] else ...[
                      const SizedBox(height: 20),
                      const Text(
                        'Verify membership against an authoritative list or with the client. Enter the verified profile details below; the applicant’s statement alone is not proof.',
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        initialValue: _cadreId,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Cadre'),
                        items: [
                          for (final cadre in cadres)
                            DropdownMenuItem(
                              value: cadre['id'] as String,
                              child: Text(
                                cadre['name'] as String,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: _busy
                            ? null
                            : (value) => setState(() => _cadreId = value),
                        validator: (value) =>
                            value == null ? 'Choose a cadre' : null,
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        initialValue:
                            bangladeshDistricts.contains(
                              _fields['homeDistrict']!.text,
                            )
                            ? _fields['homeDistrict']!.text
                            : null,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'Home district',
                        ),
                        items: [
                          for (final district in bangladeshDistricts)
                            DropdownMenuItem(
                              value: district,
                              child: Text(district),
                            ),
                        ],
                        onChanged: _busy
                            ? null
                            : (district) => _fields['homeDistrict']!.text =
                                  district ?? '',
                        validator: (value) =>
                            value == null ? 'Choose a district' : null,
                      ),
                      const SizedBox(height: 16),
                      for (final entry in {
                        'section': 'Section',
                        'education': 'Education',
                        'university': 'University',
                        'email': 'Email',
                        'bloodGroup': 'Blood group (as provided)',
                        'bcsBatch': 'BCS batch (leave blank for unknown)',
                        'reviewNote': 'How you verified membership',
                      }.entries)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: TextFormField(
                            controller: _fields[entry.key],
                            enabled: !_busy,
                            decoration: InputDecoration(labelText: entry.value),
                            maxLength: switch (entry.key) {
                              'section' => 2,
                              'email' => 254,
                              'university' => 255,
                              'homeDistrict' => 100,
                              'bloodGroup' => 500,
                              'bcsBatch' => 5,
                              'reviewNote' => 1000,
                              _ => 10000,
                            },
                            maxLines: entry.key == 'reviewNote' ? 3 : 1,
                            keyboardType: entry.key == 'email'
                                ? TextInputType.emailAddress
                                : entry.key == 'bcsBatch'
                                ? TextInputType.number
                                : TextInputType.text,
                            validator: (value) {
                              final text = value?.trim() ?? '';
                              if (entry.key == 'bcsBatch') {
                                final n = int.tryParse(text);
                                return text.isNotEmpty &&
                                        (n == null || n < 1 || n > 32767)
                                    ? 'Enter a positive batch number or leave blank'
                                    : null;
                              }
                              if (text.isEmpty) return 'Required';
                              if (entry.key == 'email' &&
                                  !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                      .hasMatch(text)) {
                                return 'Enter a valid email address';
                              }
                              return null;
                            },
                          ),
                        ),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _confirmed,
                        onChanged: _busy
                            ? null
                            : (value) =>
                                  setState(() => _confirmed = value ?? false),
                        title: const Text(
                          'I independently verified this person belongs to the 81st FTC.',
                        ),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(
                            _error!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                      FilledButton(
                        onPressed: _busy ? null : () => _approve(request),
                        child: Text(
                          _busy ? 'Saving…' : 'Approve and add member',
                        ),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _busy ? null : _reject,
                        child: const Text('Reject request'),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Approval grants eligibility to sign in. The person must still verify their phone with OTP. No approval message is sent automatically.',
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        );
      },
    ),
  );
}

class _ReviewError extends StatelessWidget {
  const _ReviewError({required this.error, required this.retry});
  final Object error;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(error.toString(), textAlign: TextAlign.center),
          TextButton(onPressed: retry, child: const Text('Retry')),
        ],
      ),
    ),
  );
}

class _RejectionDialog extends StatefulWidget {
  const _RejectionDialog();
  @override
  State<_RejectionDialog> createState() => _RejectionDialogState();
}

class _RejectionDialogState extends State<_RejectionDialog> {
  final _reason = TextEditingController();
  final _form = GlobalKey<FormState>();
  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Reject request?'),
    content: Form(
      key: _form,
      child: TextFormField(
        controller: _reason,
        maxLength: 1000,
        maxLines: 3,
        decoration: const InputDecoration(labelText: 'Reason for rejection'),
        validator: (value) =>
            (value?.trim().isEmpty ?? true) ? 'Enter a reason' : null,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(context, _reason.text.trim());
          }
        },
        child: const Text('Confirm rejection'),
      ),
    ],
  );
}
