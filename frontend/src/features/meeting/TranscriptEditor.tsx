import React, { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2, User, FileText, AlertCircle } from 'lucide-react';
import { getTranscript, updateTranscript, type TranscriptTurn } from '../../services/meetingApi';
import { getUsers, type User as UserType } from '../../services/usersApi';

interface TranscriptEditorProps {
  sessionId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  sessionId,
  onClose,
  onSaved,
}) => {
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      getTranscript(sessionId),
      getUsers().catch(() => []),
    ])
      .then(([transcriptData, usersData]) => {
        if (isMounted) {
          setTurns(transcriptData.turns || []);
          setAvailableUsers(usersData);
        }
      })
      .catch((err) => {
        console.error('Failed to load transcript:', err);
        if (isMounted) setError('Failed to load transcript content.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleTurnChange = (index: number, field: keyof TranscriptTurn, value: any) => {
    setTurns((prevTurns) => {
      const newTurns = [...prevTurns];
      newTurns[index] = { ...newTurns[index], [field]: value };
      return newTurns;
    });
  };

  const handleAddTurn = () => {
    setTurns((prev) => [
      ...prev,
      {
        speaker_id: `speaker_${prev.length + 1}`,
        speaker_name: availableUsers[0]
          ? `${availableUsers[0].first_name || ''} ${availableUsers[0].last_name || ''}`.trim() || availableUsers[0].email
          : 'Speaker',
        start_time: 0,
        end_time: 0,
        text: '',
      },
    ]);
  };

  const handleDeleteTurn = (index: number) => {
    setTurns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      await updateTranscript(sessionId, turns);
      setSaveSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      console.error('Failed to update transcript:', err);
      setError(err?.response?.data?.detail || 'Failed to save changes to transcript.');
    } finally {
      setIsSaving(false);
    }
  };

  // Collect unique speaker names present in transcript
  const existingSpeakerNames = Array.from(new Set(turns.map((t) => t.speaker_name).filter(Boolean)));
  const userDisplayNames = availableUsers.map(
    (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email
  );
  const speakerOptions = Array.from(new Set([...existingSpeakerNames, ...userDisplayNames]));

  return (
    <div className="flex flex-col h-[75vh] max-h-[700px] bg-brand-surface rounded-xl overflow-hidden">
      {/* Modal Header */}
      <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-surface-low/40 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-primary" />
          <h3 className="text-base font-semibold text-brand-text">
            Edit Transcript <span className="text-xs text-brand-text-muted font-normal">({sessionId})</span>
          </h3>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-surface-low text-brand-text border border-brand-border">
          {turns.length} turn{turns.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {error && (
          <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            Transcript saved successfully!
          </div>
        )}

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-brand-text-muted space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
            <span className="text-xs font-medium">Loading meeting transcript...</span>
          </div>
        ) : turns.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-brand-border rounded-xl space-y-3">
            <FileText className="w-8 h-8 mx-auto text-brand-text-muted opacity-50" />
            <p className="text-xs text-brand-text-muted">No transcript turns available yet for this session.</p>
            <button
              onClick={handleAddTurn}
              className="px-3 py-1.5 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-primary-hover transition-colors inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Add First Turn
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, index) => (
              <div
                key={index}
                className="p-4 rounded-xl border border-brand-border bg-brand-surface-low/30 hover:border-brand-border/80 transition-colors space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Speaker Selector / Input */}
                  <div className="flex items-center gap-2 flex-1">
                    <User className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                    <select
                      value={turn.speaker_name}
                      onChange={(e) => handleTurnChange(index, 'speaker_name', e.target.value)}
                      className="bg-brand-surface text-xs text-brand-text border border-brand-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-primary"
                    >
                      {speakerOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      {!speakerOptions.includes(turn.speaker_name) && (
                        <option value={turn.speaker_name}>{turn.speaker_name}</option>
                      )}
                    </select>

                    <input
                      type="text"
                      value={turn.speaker_name}
                      onChange={(e) => handleTurnChange(index, 'speaker_name', e.target.value)}
                      placeholder="Or edit speaker name..."
                      className="bg-brand-surface text-xs text-brand-text border border-brand-border rounded-lg px-2.5 py-1.5 flex-1 max-w-[200px] focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <button
                    onClick={() => handleDeleteTurn(index)}
                    className="p-1.5 text-brand-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                    title="Delete turn"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Textarea for turn text */}
                <textarea
                  value={turn.text}
                  onChange={(e) => handleTurnChange(index, 'text', e.target.value)}
                  rows={2}
                  placeholder="Transcript text..."
                  className="w-full bg-brand-surface text-xs text-brand-text border border-brand-border rounded-lg p-2.5 focus:outline-none focus:border-brand-primary resize-y leading-relaxed"
                />
              </div>
            ))}

            <button
              onClick={handleAddTurn}
              className="w-full py-2.5 border border-dashed border-brand-border hover:border-brand-primary rounded-xl text-xs font-semibold text-brand-text-muted hover:text-brand-primary transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} /> Add Transcript Turn
            </button>
          </div>
        )}
      </div>

      {/* Footer Action Bar */}
      <div className="px-6 py-3.5 border-t border-brand-border bg-brand-surface-low/40 flex items-center justify-between shrink-0">
        <button
          onClick={onClose}
          disabled={isSaving}
          className="px-4 py-2 text-xs font-semibold text-brand-text-muted hover:text-brand-text transition-colors cursor-pointer"
        >
          Cancel
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="px-5 py-2 text-xs font-semibold bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save size={14} /> Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default TranscriptEditor;
