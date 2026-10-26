import 'package:flutter/material.dart';

import '../preview_member.dart';

/// A local copy of the membership-request workflow for store review. Nothing
/// here calls the member API or changes the real roster.
class ReviewerRequestsScreen extends StatefulWidget {
  const ReviewerRequestsScreen({required this.onApprove, super.key});

  final ValueChanged<PreviewMember> onApprove;

  @override
  State<ReviewerRequestsScreen> createState() => _ReviewerRequestsScreenState();
}

class _ReviewerRequest {
  _ReviewerRequest({required this.id, required this.name, required this.evidence});

  final int id;
  final String name;
  final String evidence;
  String status = 'pending';
  String reviewNote = '';
}

class _ReviewerRequestsScreenState extends State<ReviewerRequestsScreen> {
  final List<_ReviewerRequest> _requests = [
    _ReviewerRequest(
      id: 1,
      name: 'Example Applicant A',
      evidence: 'Fictional request: Section A, Administration cadre.',
    ),
    _ReviewerRequest(
      id: 2,
      name: 'Example Applicant B',
      evidence: 'Fictional request: Section B, Police cadre.',
    ),
  ];
  String _status = 'pending';

  void _createRequest() {
    setState(() {
      final id = _requests.length + 1;
      _requests.add(
        _ReviewerRequest(
          id: id,
          name: 'Example Applicant $id',
          evidence: 'Fictional membership details for reviewer testing.',
        ),
      );
      _status = 'pending';
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Fictional request added to the demo queue.')),
    );
  }

  Future<void> _openRequest(_ReviewerRequest request) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => _ReviewerRequestDetail(
          request: request,
          onDecision: (approved, note) {
            setState(() {
              request.status = approved ? 'approved' : 'rejected';
              request.reviewNote = note;
              if (approved) {
                widget.onApprove(
                  PreviewMember(
                    name: request.name,
                    ftcId: 'Example ${request.id + 100}',
                    section: 'A',
                    cadre: 'Administration',
                    bcsBatch: '43rd',
                    education: 'Example degree',
                    university: 'Example University',
                    phone: 'Example contact',
                    email: 'applicant${request.id}@example.com',
                    bloodGroup: 'A+',
                    homeDistrict: 'Dhaka',
                    aboutMe: 'Approved in the fictional reviewer demo.',
                  ),
                );
              }
            });
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shown = _requests.where((request) => request.status == _status).toList();
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'Administrator review preview. Every request is fictional. Approving or rejecting one changes only this on-device demo.',
                ),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _createRequest,
              icon: const Icon(Icons.person_add_alt_1_outlined),
              label: const Text('Create fictional request'),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _status,
              decoration: const InputDecoration(labelText: 'Request status'),
              items: const [
                DropdownMenuItem(value: 'pending', child: Text('Pending')),
                DropdownMenuItem(value: 'approved', child: Text('Approved')),
                DropdownMenuItem(value: 'rejected', child: Text('Rejected')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _status = value);
              },
            ),
            const SizedBox(height: 16),
            Text('${shown.length} $_status requests'),
            const SizedBox(height: 8),
            if (shown.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No fictional requests in this category.'),
              ),
            for (final request in shown)
              Card(
                child: ListTile(
                  title: Text(request.name),
                  subtitle: Text('Example request ${request.id} · ${request.status}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _openRequest(request),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ReviewerRequestDetail extends StatefulWidget {
  const _ReviewerRequestDetail({required this.request, required this.onDecision});

  final _ReviewerRequest request;
  final void Function(bool approved, String note) onDecision;

  @override
  State<_ReviewerRequestDetail> createState() => _ReviewerRequestDetailState();
}

class _ReviewerRequestDetailState extends State<_ReviewerRequestDetail> {
  final _note = TextEditingController();
  bool _verified = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _decide(bool approved) async {
    if (approved && !_verified) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Confirm fictional membership first.')),
      );
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(approved ? 'Approve fictional request?' : 'Reject fictional request?'),
        content: const Text('This changes only the local reviewer demo.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    widget.onDecision(approved, _note.text.trim());
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Review membership')),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 700),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(widget.request.name, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text('Status: ${widget.request.status}'),
            const SizedBox(height: 20),
            const Text('Membership details supplied'),
            const SizedBox(height: 8),
            Text(widget.request.evidence),
            const SizedBox(height: 20),
            if (widget.request.status == 'pending') ...[
              const Text('Real administrators must verify membership independently. This reviewer example is fictional.'),
              const SizedBox(height: 16),
              CheckboxListTile(
                value: _verified,
                onChanged: (value) => setState(() => _verified = value ?? false),
                title: const Text('Confirm fictional membership for this demo'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                decoration: const InputDecoration(labelText: 'Review note'),
                maxLines: 3,
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => _decide(true),
                child: const Text('Approve fictional request'),
              ),
              TextButton(
                onPressed: () => _decide(false),
                child: const Text('Reject fictional request'),
              ),
            ] else Text('Review note: ${widget.request.reviewNote.isEmpty ? 'None' : widget.request.reviewNote}'),
          ],
        ),
      ),
    ),
  );
}
